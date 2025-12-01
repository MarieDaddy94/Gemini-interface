import { GoogleGenAI, Type, Schema } from "@google/genai";
import { AnalystPersona, AgentJournalDraft, AnalystHistoryItem } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// ---------- Shared helpers ----------

function extractJson(text: string | undefined): string | null {
  if (!text) return null;
  let jsonStr = text.trim();
  if (!jsonStr) return null;

  // Strip ```json fences if the model added them
  const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
  const match = jsonStr.match(fenceRegex);
  if (match && match[2]) {
    jsonStr = match[2].trim();
  }
  return jsonStr;
}

// ---------- Schema: multi-persona + optional journal draft ----------

const journalDraftSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: "Short headline / playbook name, e.g. 'US30 NY Reversal Fade'."
    },
    summary: {
      type: Type.STRING,
      description: "3–6 sentences explaining the setup or post-trade lesson."
    },
    sentiment: {
      type: Type.STRING,
      description: "Bullish / Bearish / Neutral directional stance."
    },
    tags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Short tags like ['LondonOpen','US30','trendPullback'] (no #)."
    },
    agentId: {
      type: Type.STRING,
      enum: ["agent-quant", "agent-trend", "agent-pattern"],
      description: "Identifier used by the UI to color the agent pill."
    },
    agentName: {
      type: Type.STRING,
      enum: [
        AnalystPersona.QUANT_BOT,
        AnalystPersona.TREND_MASTER,
        AnalystPersona.PATTERN_GPT
      ],
      description: "Human-readable persona name."
    }
  },
  required: ["title", "summary", "sentiment", "tags", "agentId", "agentName"]
};

const analysisSchema: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      analystName: {
        type: Type.STRING,
        enum: [
          AnalystPersona.QUANT_BOT,
          AnalystPersona.TREND_MASTER,
          AnalystPersona.PATTERN_GPT
        ],
        description: "The name of the AI analyst persona speaking."
      },
      message: {
        type: Type.STRING,
        description: "The analysis or comment from this persona."
      },
      journalDraft: journalDraftSchema // OPTIONAL because it's not in 'required'
    },
    required: ["analystName", "message"]
  }
};

// ---------- Types exposed to the rest of the app ----------

export interface AnalystInsight {
  analystName: AnalystPersona;
  message: string;
  journalDraft?: AgentJournalDraft | null;
}

interface GetInsightsOptions {
  mode?: "default" | "teamDebate";
}

// ---------------------------------------------------------------------
// 1) Multi-analyst insight generator (QuantBot, TrendMaster, Pattern_GPT)
//    with conversation history + optional journalDraft
// ---------------------------------------------------------------------

export const getAnalystInsights = async (
  userPrompt: string,
  chartContext: string,
  imageBase64?: string,
  history?: AnalystHistoryItem[],
  options?: GetInsightsOptions
): Promise<AnalystInsight[]> => {
  try {
    const modelId = "gemini-2.5-flash";

    const parts: any[] = [];

    if (imageBase64) {
      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: imageBase64
        }
      });
    }

    let historyText = "";
    if (history && history.length) {
      const trimmed = history.slice(-20); // keep last ~20 turns
      const lines = trimmed.map((h) => {
        const label = h.isUser ? "Trader" : h.speaker;
        return `- ${label}: ${h.text}`;
      });
      historyText = `
Previous conversation (most recent last):
${lines.join("\n")}
`;
    }

    const modeText =
      options?.mode === "teamDebate"
        ? `MODE: TEAM DEBATE.
- Treat this as an internal huddle. Each persona may react to previous analyst comments:
  - Agree or disagree politely.
  - Refine the plan or point out missing risks.
- Avoid repeating the same information verbatim.`
        : `MODE: COORDINATED TEAM.
- Respond as a coordinated team where each persona adds unique value.
- Avoid redundancy and keep each response focused on its specialty.`;

    const journalingInstructions = `
JOURNALING RULES:
- For any reply that clearly describes a setup or lesson you want to remember,
  populate "journalDraft" with:
  - title: short nickname for the setup or lesson.
  - summary: 3–6 sentences describing the idea, key confluence, and risk.
  - tags: 2–6 short tokens like ["LondonOpen","US30","trendPullback"] (no #).
  - sentiment: "Bullish", "Bearish", or "Neutral".
  - agentId: one of "agent-quant", "agent-trend", "agent-pattern".
  - agentName: your persona name.
- If this reply should NOT be logged, either omit journalDraft or set it to null.
- Do NOT mention journaling, tags, or 'journalDraft' in the user-visible message. Keep that
  purely in the JSON field.`;

    parts.push({
      text: `
You are a coordinated AI trading team answering a human trader.

Personas:
1. QuantBot (agent-quant):
   - Statistics, volatility, risk, win-rate, R:R, sample size.
2. TrendMaster AI (agent-trend):
   - Trend, momentum, HTF confluence, trade management.
3. ChartPattern_GPT (agent-pattern):
   - Market structure, support/resistance, liquidity, classic TA patterns.

Environment context:
- Broker/Market data: ${chartContext}
${historyText}

Trader question: "${userPrompt}"

${modeText}
${journalingInstructions}

OUTPUT FORMAT:
- Respond ONLY as JSON matching the given schema (array of { analystName, message, optional journalDraft }).
- analystName must be one of: "${AnalystPersona.QUANT_BOT}", "${AnalystPersona.TREND_MASTER}", "${AnalystPersona.PATTERN_GPT}".
- Keep each persona's message concise and non-overlapping.
`
    });

    const response = await ai.models.generateContent({
      model: modelId,
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
        systemInstruction:
          "You are a specialized AI trading team. Always reply in JSON format as an array of analyst messages, optionally including journalDraft objects."
      }
    });

    const rawText = (response as any).text as string | undefined;
    const jsonStr = extractJson(rawText);
    if (!jsonStr) return [];

    return JSON.parse(jsonStr) as AnalystInsight[];
  } catch (error) {
    console.error("Gemini Analyst API Error:", error);
    return [
      {
        analystName: AnalystPersona.QUANT_BOT,
        message:
          "I'm having trouble analyzing the data stream right now. Please try again."
      }
    ];
  }
};

// ---------------------------------------------------------------------
// 2) Journal coach: summarize tag/symbol stats and coach the trader
//    (unchanged, still used by /coach)
// ---------------------------------------------------------------------

export const getCoachFeedback = async (coachContext: any): Promise<string> => {
  try {
    const modelId = "gemini-2.5-flash";

    const prettyJson = JSON.stringify(coachContext, null, 2);

    const response = await ai.models.generateContent({
      model: modelId,
      contents: {
        parts: [
          {
            text: `
You are a trading performance coach.

You will receive JSON describing this trader's performance for a specific "playbook tag"
(e.g. "LondonOpen", "Nas100_M5_Scalp") and optionally a specific symbol (e.g. "US30", "XAUUSD").

Your job:
- Read the stats and entries.
- Identify patterns: where this tag does well, where it leaks money, how confidence and outcomes line up.
- Speak directly to the trader in 2–3 short sections:

1) "Quick Snapshot":
   - Mention the tag and symbol (if provided)
   - Show win-rate, total trades, and rough average PnL from the stats.
   - Call out any obvious skew: overtrading, revenge trading, tiny sample size, etc.

2) "What’s Working":
   - 3–5 bullet points focusing on strengths and setups they seem to execute well.

3) "Fix These Leaks Next":
   - 3–5 bullet points focusing on mistakes, over-confidence/under-confidence, or conditions where this tag underperforms.
   - Be honest but constructive, like a coach in a locker room.

Keep it concise and conversational, like a coach talking between sessions.

Here is the JSON context to analyze:

${prettyJson}
          `
          }
        ]
      }
    });

    const text = ((response as any).text as string | undefined) || "";
    return text.trim() || "Coach summary is empty. Try again after a few more trades.";
  } catch (error) {
    console.error("Gemini Coach API Error:", error);
    return "I'm having trouble reading your journal stats right now. Try again later.";
  }
};

// ---------------------------------------------------------------------
// 3) Session summary stub (kept for compatibility)
// ---------------------------------------------------------------------
export const getSessionSummary = async (
  chartContext: string,
  history: any[]
) => {
  // Currently unused; kept to avoid breaking any imports.
  return {
    headlineBias: "System update",
    scalpPlan: {
      bias: "Neutral",
      entryPlan: "",
      invalidation: "",
      targets: "",
      rr: ""
    },
    swingPlan: {
      bias: "Neutral",
      entryPlan: "",
      invalidation: "",
      targets: "",
      rr: ""
    }
  };
};
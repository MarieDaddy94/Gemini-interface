import { GoogleGenAI, Type, Schema } from "@google/genai";
import { AnalystPersona, SessionSummary } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Schema for multi-persona analyst responses
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
          AnalystPersona.PATTERN_GPT,
        ],
        description: "The name of the AI analyst persona speaking.",
      },
      message: {
        type: Type.STRING,
        description: "The analysis or comment from this persona.",
      },
    },
    required: ["analystName", "message"],
  },
};

// Schema for session playbook summary
const sessionSummarySchema: Schema = {
  type: Type.OBJECT,
  properties: {
    headlineBias: { type: Type.STRING },
    keyLevels: { type: Type.STRING, nullable: true },
    scalpPlan: {
      type: Type.OBJECT,
      properties: {
        bias: { type: Type.STRING },
        entryPlan: { type: Type.STRING },
        invalidation: { type: Type.STRING },
        targets: { type: Type.STRING },
        rr: { type: Type.STRING }
      },
      required: ["bias", "entryPlan", "invalidation", "targets", "rr"]
    },
    swingPlan: {
      type: Type.OBJECT,
      properties: {
        bias: { type: Type.STRING },
        entryPlan: { type: Type.STRING },
        invalidation: { type: Type.STRING },
        targets: { type: Type.STRING },
        rr: { type: Type.STRING }
      },
      required: ["bias", "entryPlan", "invalidation", "targets", "rr"]
    },
    riskNotes: { type: Type.STRING, nullable: true }
  },
  required: ["headlineBias", "scalpPlan", "swingPlan"]
};

function extractJson(text: string | undefined): string | null {
  if (!text) return null;
  let jsonStr = text.trim();
  if (!jsonStr) return null;

  const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
  const match = jsonStr.match(fenceRegex);
  if (match && match[2]) {
    jsonStr = match[2].trim();
  }
  return jsonStr;
}

// ---------------------------------------------------------------------
// 1) Multi-analyst insight generator (QuantBot, TrendMaster, Pattern_GPT)
// ---------------------------------------------------------------------
export const getAnalystInsights = async (
  userPrompt: string,
  chartContext: string,
  imageBase64?: string
) => {
  try {
    const modelId = "gemini-2.5-flash";

    const parts: any[] = [];

    if (imageBase64) {
      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: imageBase64,
        },
      });
    }

    parts.push({
      text: `
        Context: The user is looking at a trading dashboard with a TradingView chart.
        Broker / Market Data Feed Summary: ${chartContext}

        User Question: "${userPrompt}"

        Task: You are simulating a team of AI financial analysts.
        1. QuantBot: Focuses on numbers, volatility, and statistical probability.
        2. TrendMaster AI: Focuses on moving averages, momentum, and macro trends.
        3. ChartPattern_GPT: Focuses on support/resistance, chart patterns, and classic TA.

        ${
          imageBase64
            ? "IMPORTANT: A screenshot of the user's screen is attached. Analyze the TRADING CHARTS only (candles, indicators, levels). Ignore the chat overlay."
            : ""
        }

        Based on the user's question and the visual/data context, provide 1 to 2 distinct responses
        from the most relevant personas.

        Output: JSON ONLY, matching the schema: an array of { analystName, message }.
      `,
    });

    const response = await ai.models.generateContent({
      model: modelId,
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
        systemInstruction:
          "You are a specialized AI trading team. Always reply in JSON format as an array of analyst messages.",
      },
    });

    const rawText = (response as any).text as string | undefined;
    const jsonStr = extractJson(rawText);
    if (!jsonStr) return [];

    return JSON.parse(jsonStr) as { analystName: string; message: string }[];
  } catch (error) {
    console.error("Gemini Analyst API Error:", error);
    return [
      {
        analystName: AnalystPersona.QUANT_BOT,
        message:
          "I'm having trouble analyzing the data stream right now. Please try again.",
      },
    ];
  }
};

// ---------------------------------------------------------------------
// 2) Journal coach: summarize tag/symbol stats and coach the trader
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
   - Show win-rate, total trades, average PnL (roughly from totalPnl/closedWithPnl).
   - Call out any obvious skew: overtrading, revenge trading, tiny sample size, etc.

2) "What’s Working":
   - 3–5 bullet points focusing on strengths and setups they seem to execute well.

3) "Fix These Leaks Next":
   - 3–5 bullet points focusing on mistakes, over-confidence/under-confidence, or conditions where this tag underperforms.
   - Be honest but constructive, like a coach in a locker room.

Keep it concise and conversational, like a coach talking between sessions.

Here is the JSON context to analyze:

${prettyJson}
          `,
          },
        ],
      },
    });

    const text = ((response as any).text as string | undefined) || "";
    return text.trim() || "Coach summary is empty. Try again after a few more trades.";
  } catch (error) {
    console.error("Gemini Coach API Error:", error);
    return "I'm having trouble reading your journal stats right now. Try again later.";
  }
};

// ---------------------------------------------------------------------
// 3) Session Summary: build structured playbook / lane plans
// ---------------------------------------------------------------------

export const getSessionSummary = async (
  chartContext: string,
  history: { sender: string; text: string; isUser: boolean }[]
): Promise<SessionSummary> => {
  try {
    const modelId = "gemini-2.5-flash";

    const lastMessages = history.slice(-30);
    const historyText = lastMessages
      .map((m) => `${m.isUser ? "Trader" : m.sender}: ${m.text}`)
      .join("\n");

    const prompt = `
You are an elite trading desk assistant.

You will receive:
- A compact description of the current market / broker context.
- A transcript of the most recent conversation between the trader and an AI team of analysts.

Your job is to output a *structured* session playbook in JSON with this exact shape:

{
  "headlineBias": "Short sentence summarizing the session bias (e.g. 'US30 mildly bullish into NY open').",
  "keyLevels": "Optional quick list of key HTF levels or zones, if they are clearly implied.",
  "scalpPlan": {
    "bias": "Bullish/Bearish/Neutral for scalps.",
    "entryPlan": "Concrete rules for aggressive intraday entries.",
    "invalidation": "Where the idea is clearly wrong / must step aside.",
    "targets": "Realistic scaling/TP ideas for scalps.",
    "rr": "How to think about risk:reward for scalps."
  },
  "swingPlan": {
    "bias": "Bullish/Bearish/Neutral for swings.",
    "entryPlan": "Rules for higher timeframe swing entries, if relevant.",
    "invalidation": "Invalidation conditions for the swing idea.",
    "targets": "Potential swing targets.",
    "rr": "Risk:reward perspective for swing trades."
  },
  "riskNotes": "Short note on risk (e.g. news, overtrading, sizing, account pressure)."
}

Keep it practical and short – like a one-page laminated card a trader could glance at before clicking.

Market / broker context:
${chartContext}

Recent conversation:
${historyText}
`;

    const response = await ai.models.generateContent({
      model: modelId,
      contents: { parts: [{ text: prompt }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: sessionSummarySchema,
        systemInstruction:
          "You are a professional trading session summarizer. Always return valid JSON that matches the provided schema."
      }
    });

    const rawText = (response as any).text as string | undefined;
    const jsonStr = extractJson(rawText);
    if (!jsonStr) {
      throw new Error("No JSON in session summary response");
    }

    const parsed = JSON.parse(jsonStr) as SessionSummary;
    return parsed;
  } catch (error) {
    console.error("Gemini Session Summary API Error:", error);
    return {
      headlineBias: "Session tagged, but summary generation failed.",
      keyLevels: "",
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
      },
      riskNotes: "Review risk manually; AI summary unavailable."
    };
  }
};
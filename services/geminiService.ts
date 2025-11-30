import { GoogleGenAI, Type, Schema } from "@google/genai";
import { AnalystPersona } from "../types";

const apiKey = process.env.API_KEY || "";
const ai = new GoogleGenAI({ apiKey });

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

function extractJson(text: string | undefined): string | null {
  if (!text) return null;
  let jsonStr = text.trim();
  if (!jsonStr) return null;

  // If the model wrapped it in ```json ... ``` fences, strip them
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
// 3) Legacy / Optional: Session Summary (kept for compatibility)
// ---------------------------------------------------------------------
export const getSessionSummary = async (
    // kept as placeholder if needed, or fully replaced if not used by updated components
    chartContext: string,
    history: any[]
  ) => {
    // This function is currently not used by the new Coach overlay, 
    // but kept to prevent breakages if other components import it.
    return {
        headlineBias: "System update",
        scalpPlan: { bias: "Neutral", entryPlan: "", invalidation: "", targets: "", rr: "" },
        swingPlan: { bias: "Neutral", entryPlan: "", invalidation: "", targets: "", rr: "" }
    };
};

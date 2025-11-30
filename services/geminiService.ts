import { GoogleGenAI, Type, Schema } from "@google/genai";
import { AnalystPersona, ChatMessage, SessionSummary } from "../types";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

// Schema for multi-persona chat responses
const analysisSchema: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      analystName: {
        type: Type.STRING,
        enum: [AnalystPersona.QUANT_BOT, AnalystPersona.TREND_MASTER, AnalystPersona.PATTERN_GPT],
        description: "The name of the AI analyst persona speaking."
      },
      message: {
        type: Type.STRING,
        description: "The analysis or comment from this persona."
      }
    },
    required: ["analystName", "message"]
  }
};

// Schema for structured Session Playbook with Scalp/Swing lanes
const summarySchema: Schema = {
  type: Type.OBJECT,
  properties: {
    headlineBias: {
      type: Type.STRING,
      description: "Overall directional bias and timeframe context, e.g. 'Intraday bullish while daily still corrective'."
    },
    keyLevels: {
      type: Type.STRING,
      description: "Key support/resistance, zones, VWAP or HTF anchors in compact text."
    },
    scalpPlan: {
      type: Type.OBJECT,
      properties: {
        bias: {
          type: Type.STRING,
          description: "Directional bias specifically for scalping."
        },
        entryPlan: {
          type: Type.STRING,
          description: "How to enter scalps: trigger conditions, zones, timing."
        },
        invalidation: {
          type: Type.STRING,
          description: "Where the scalp idea is wrong / stop logic."
        },
        targets: {
          type: Type.STRING,
          description: "Scalp targets / partials."
        },
        rr: {
          type: Type.STRING,
          description: "Explicit R:R expectations for scalps, like '2R–3R only'."
        }
      },
      required: ["bias", "entryPlan", "invalidation", "targets", "rr"]
    },
    swingPlan: {
      type: Type.OBJECT,
      properties: {
        bias: {
          type: Type.STRING,
          description: "Directional bias for swing ideas."
        },
        entryPlan: {
          type: Type.STRING,
          description: "How to enter swings: HTF conditions, pullbacks, confirmations."
        },
        invalidation: {
          type: Type.STRING,
          description: "Where the swing thesis is invalid."
        },
        targets: {
          type: Type.STRING,
          description: "Swing targets / partials."
        },
        rr: {
          type: Type.STRING,
          description: "Explicit R:R expectations for swings."
        }
      },
      required: ["bias", "entryPlan", "invalidation", "targets", "rr"]
    },
    riskNotes: {
      type: Type.STRING,
      description: "Warnings about volatility, news events, or risk management."
    }
  },
  required: ["headlineBias", "scalpPlan", "swingPlan"]
};

export const getAnalystInsights = async (
  userPrompt: string,
  chartContext: string,
  imageBase64?: string,
  history?: ChatMessage[],
  focusSymbol?: string
) => {
  try {
    const modelId = "gemini-2.5-flash"; 
    
    const parts: any[] = [];

    const symbolFocusText = focusSymbol && focusSymbol !== 'Auto'
      ? `Current focus symbol: ${focusSymbol}. Anchor all analysis primarily to this instrument unless the user clearly asks otherwise.`
      : `Current focus symbol: Auto. Infer the most relevant symbol from charts, broker positions, and the conversation. If ambiguous, prioritize major indices (US30/NAS100) or XAUUSD/BTCUSD being discussed.`;

    // Compress conversation history to last N messages
    const recentHistory = (history ?? []).slice(-12);
    const historyText = recentHistory.length
      ? recentHistory
          .map((msg) => `${msg.isUser ? "Trader" : msg.sender}: ${msg.text}`)
          .join("\n")
      : "No prior conversation context. Start fresh based on the current question and data.";
    
    // If an image is provided, add it as the first part
    if (imageBase64) {
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: imageBase64
        }
      });
    }

    // Add the text prompt
    parts.push({
      text: `
        Context: The user is looking at a trading dashboard with a TradingView chart.
        Broker Data Feed Summary: ${chartContext}

        ${symbolFocusText}

        Conversation so far (most recent messages, trader + AI):
        ${historyText}
        
        User Question: "${userPrompt}"
        
        Task: You are simulating a team of AI financial analysts.
        1. QuantBot: Focuses on numbers, volatility, and statistical probability.
        2. TrendMaster AI: Focuses on moving averages, momentum, and macro trends.
        3. ChartPattern_GPT: Focuses on support/resistance, shapes (double bottom, head and shoulders), and technical indicators.
        
        ${imageBase64 ? "IMPORTANT: A screenshot of the user's screen is attached. Analyze the visual chart data (candlesticks, lines, indicators) to answer the user's question. The chat overlay you are residing in is on the right side of the image; ignore it and focus only on the trading charts on the left." : ""}

        Based on the user's question, the ongoing conversation, and the visual/data context, provide 1 to 2 distinct responses from the most relevant personas.
        Keep responses concise, professional, yet conversational like a trader chat room.
        Always speak as if you are primarily analyzing the focus symbol.
      `
    });

    const response = await ai.models.generateContent({
      model: modelId,
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
        systemInstruction: "You are a specialized AI trading team. Always reply in JSON format as an array of analyst messages."
      }
    });

    const jsonText = (response as any).text;
    if (!jsonText) return [];
    
    return JSON.parse(jsonText) as { analystName: string; message: string }[];

  } catch (error) {
    console.error("Gemini API Error (getAnalystInsights):", error);
    return [{
      analystName: AnalystPersona.QUANT_BOT,
      message: "I'm having trouble analyzing the data stream right now. Please try again."
    }];
  }
};

export const getSessionSummary = async (
  chartContext: string,
  history: ChatMessage[],
  imageBase64?: string,
  focusSymbol?: string
): Promise<SessionSummary> => {
  try {
    const modelId = "gemini-2.5-flash";

    const parts: any[] = [];

    const recentHistory = (history ?? []).slice(-20);
    const historyText = recentHistory.length
      ? recentHistory
          .map((msg) => `${msg.isUser ? "Trader" : msg.sender}: ${msg.text}`)
          .join("\n")
      : "No prior conversation yet. Use only the market context.";

    const symbolFocusText = focusSymbol && focusSymbol !== 'Auto'
      ? `Focus this Session Playbook specifically on ${focusSymbol}. If you mention levels or zones, they should belong to this symbol.`
      : `Symbol focus is Auto. Infer the most relevant symbol from the context (charts, broker positions, conversation). If ambiguous, lean towards the primary risk driver / most discussed symbol.`;

    if (imageBase64) {
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: imageBase64
        }
      });
    }

    parts.push({
      text: `
        You are summarizing an intraday trading session for a team of AI analysts.

        Broker / Market Context Snapshot:
        ${chartContext}

        ${symbolFocusText}

        Conversation Transcript (latest messages first to last):
        ${historyText}

        Task:
        - Produce a compact "Session Playbook" for the top of the chat.
        - This is NOT chat-style output; it's a summary object for humans to glance at before placing trades.
        - You MUST fill two separate lanes:
          * Scalp lane (fast trades, smaller targets, tighter invalidation).
          * Swing lane (slower ideas, HTF context, wider invalidation).
        - Each lane must explicitly state:
          * bias (direction + timeframe)
          * entryPlan (when/where to enter)
          * invalidation (where the idea is wrong)
          * targets (TP / partials)
          * rr (explicit risk:reward like "2R–3R", "≥1.5R", etc.)

        Style:
        - Each field should read like short bullet points, not long paragraphs.
        - You can separate bullets using semicolons or "•" characters inside the strings.
        - Keep everything punchy and directly actionable.
        - Treat all commentary as referring to the focus symbol.

        Output:
        - Strictly follow the provided JSON schema for SessionSummary.
        - Do not include explanations outside the JSON object.
      `
    });

    const response = await ai.models.generateContent({
      model: modelId,
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: summarySchema,
        systemInstruction: "You are a trading desk summarizer. Always respond as a single JSON object matching the SessionSummary schema."
      }
    });

    const jsonText = (response as any).text;
    if (!jsonText) {
      return {
        headlineBias: "No clear bias yet.",
        keyLevels: "Waiting for more price action and context.",
        scalpPlan: {
          bias: "Neutral scalp bias.",
          entryPlan: "Wait for clear intraday structure and confirmation.",
          invalidation: "Scalp invalid once structure flips against the idea.",
          targets: "Small intraday pushes only; take profit quickly.",
          rr: "Aim for at least 1.5R on scalps."
        },
        swingPlan: {
          bias: "No strong swing bias yet.",
          entryPlan: "Wait for HTF trend and levels to be clearer.",
          invalidation: "Swing invalid once HTF structure flips.",
          targets: "Use major HTF levels as targets once bias appears.",
          rr: "Aim for 2R+ on swings."
        },
        riskNotes: "Ask the analysts a question or let more data come in to refine this playbook."
      };
    }

    const parsed = JSON.parse(jsonText) as SessionSummary;
    return parsed;

  } catch (error) {
    console.error("Gemini API Error (getSessionSummary):", error);
    return {
      headlineBias: "Summary unavailable (API error).",
      keyLevels: "Use your marked zones and recent highs/lows as provisional levels.",
      scalpPlan: {
        bias: "Neutral until tools stabilize.",
        entryPlan: "Scalp only the clearest setups if you trade; otherwise, sit out.",
        invalidation: "Cut losers fast; avoid averaging down.",
        targets: "Take quick profits at logical intraday pivots.",
        rr: "Keep at least ~1.5R even on small scalps."
      },
      swingPlan: {
        bias: "Avoid new swings while the AI tools are unstable.",
        entryPlan: "Prefer to wait for stable data and a clear HTF trend before new swing entries.",
        invalidation: "Abandon swing ideas when structure breaks on HTF.",
        targets: "Favor conservative targets until confidence increases.",
        rr: "Do not take swings under 2R expected."
      },
      riskNotes: "When tools or data feeds are flaky, size down or stay flat. Protect capital first."
    };
  }
};
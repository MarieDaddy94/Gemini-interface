import { Tool, Type } from "@google/genai";

/**
 * Tool: get_chart_playbook
 * The model calls this when it wants your backend to generate
 * a structured playbook for the current chart / account state.
 */
export const chartPlaybookTool: Tool = {
  functionDeclarations: [
    {
      name: "get_chart_playbook",
      description:
        "Fetches saved strategy playbooks for a given symbol/timeframe. " +
        "Use this whenever you are planning a trade and want to anchor the plan to a known playbook.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          symbol: {
            type: Type.STRING,
            description: "Symbol name, e.g. 'US30', 'NAS100', 'XAUUSD'.",
          },
          timeframe: {
            type: Type.STRING,
            description:
              "Active chart timeframe, e.g. '1m', '5m', '15m', '1h'.",
          },
          direction: {
            type: Type.STRING,
            enum: ["long", "short", "neutral"],
            description: "Intended trade direction.",
          },
        },
        required: ["symbol"],
      },
    },
  ],
};

/**
 * Tool: log_trade_journal
 * The model calls this after a trade is closed or analyzed,
 * so your backend can write a structured journal entry.
 */
export const logTradeJournalTool: Tool = {
  functionDeclarations: [
    {
      name: "log_trade_journal",
      description:
        "Log a structured journal entry for a completed or planned trade. " +
        "Call this when you finalize a trade idea or after a trade closes.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          symbol: {
            type: Type.STRING,
            description: "Symbol traded, e.g. 'US30'.",
          },
          timeframe: {
            type: Type.STRING,
            description: "Primary execution timeframe.",
          },
          direction: {
            type: Type.STRING,
            enum: ["long", "short", "neutral"],
            description: "Trade direction.",
          },
          rMultiple: {
            type: Type.NUMBER,
            description: "Realized R-multiple or planned R.",
          },
          entryPrice: { type: Type.NUMBER },
          stopLoss: { type: Type.NUMBER },
          takeProfit: { type: Type.NUMBER },
          size: { type: Type.NUMBER },
          outcome: {
            type: Type.STRING,
            description: "Status: 'win', 'loss', 'BE', 'planned', 'canceled'.",
          },
          notes: {
            type: Type.STRING,
            description: "Short summary of reasoning or lesson.",
          },
          agentName: {
            type: Type.STRING,
            description: "Which agent proposed this trade.",
          },
          autopilotMode: {
            type: Type.STRING,
            description: "confirm | auto | sim",
          },
        },
        required: ["symbol"],
      },
    },
  ],
};

export const GEMINI_LIVE_TOOLS: Tool[] = [
  chartPlaybookTool,
  logTradeJournalTool,
];

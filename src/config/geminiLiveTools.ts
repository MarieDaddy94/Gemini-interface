// src/config/geminiLiveTools.ts
import { Tool, Type } from "@google/genai";

/**
 * Tool: get_chart_playbook
 */
export const chartPlaybookTool: Tool = {
  functionDeclarations: [
    {
      name: "get_chart_playbook",
      description:
        "Generate or fetch a concise, structured trading playbook for the current chart and account context. " +
        "Use it before proposing entries, especially in Autopilot mode.",
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
              "Active chart timeframe, e.g. '1m', '5m', '15m', '1h', '4h', '1d'.",
          },
          riskProfile: {
            type: Type.STRING,
            description:
              "Optional risk flavor like 'conservative', 'standard', or 'aggressive'.",
          },
          visionSummary: {
            type: Type.STRING,
            description:
              "Optional summary of what the vision model sees on the chart (structure, liquidity, etc.).",
          },
          accountSnapshot: {
            type: Type.OBJECT,
            description:
              "Optional account state: balance, equity, open PnL, daily drawdown, etc.",
          },
        },
        required: ["symbol", "timeframe"],
      },
    },
  ],
};

/**
 * Tool: log_trade_journal
 */
export const logTradeJournalTool: Tool = {
  functionDeclarations: [
    {
      name: "log_trade_journal",
      description:
        "Log a structured journal entry for a completed or planned trade. " +
        "Use this right after summarizing a trade outcome or a key lesson.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          symbol: {
            type: Type.STRING,
            description: "Symbol traded, e.g. 'US30'.",
          },
          timeframe: {
            type: Type.STRING,
            description: "Primary execution timeframe, e.g. '1m', '5m'.",
          },
          direction: {
            type: Type.STRING,
            description: "Trade direction: 'long' or 'short'.",
          },
          rMultiple: {
            type: Type.NUMBER,
            description:
              "Realized R-multiple of the trade (e.g. 1.5 for +1.5R, -1.0 for -1R).",
          },
          notes: {
            type: Type.STRING,
            description:
              "Short summary of why the trade was taken and what was learned.",
          },
          tags: {
            type: Type.ARRAY,
            description: "Optional list of tags: setup name, session, etc.",
            items: { type: Type.STRING },
          },
          screenshotId: {
            type: Type.STRING,
            description:
              "Optional ID or URL for a chart screenshot associated with this trade.",
          },
        },
        required: ["symbol", "timeframe", "direction", "rMultiple"],
      },
    },
  ],
};

/**
 * Tool: get_autopilot_proposal
 */
export const autopilotProposalTool: Tool = {
  functionDeclarations: [
    {
      name: "get_autopilot_proposal",
      description:
        "Ask the backend risk engine to compute a structured trade proposal " +
        "with position size and basic risk checks. Use this when turning a " +
        "playbook into an actionable trade.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          symbol: {
            type: Type.STRING,
            description: "Symbol, e.g. 'US30'.",
          },
          timeframe: {
            type: Type.STRING,
            description: "Execution timeframe, e.g. '1m', '5m', '15m'.",
          },
          direction: {
            type: Type.STRING,
            description: "Trade direction: 'long' or 'short'.",
          },
          accountEquity: {
            type: Type.NUMBER,
            description: "Current account equity.",
          },
          riskPercent: {
            type: Type.NUMBER,
            description:
              "Risk as percent of equity per trade (e.g. 0.5 = 0.5%).",
          },
          mode: {
            type: Type.STRING,
            description: "confirm | auto | sim",
          },
          entryPrice: {
            type: Type.NUMBER,
            description: "Planned entry price.",
          },
          stopLossPrice: {
            type: Type.NUMBER,
            description: "Planned stop loss price.",
          },
          rMultipleTarget: {
            type: Type.NUMBER,
            description: "Target R multiple, e.g. 3 for 3R.",
          },
          visionSummary: {
            type: Type.STRING,
            description:
              "Short summary from vision about the chart structure and liquidity.",
          },
          notes: {
            type: Type.STRING,
            description:
              "Extra context or justification to store with this proposal.",
          },
        },
        required: ["symbol", "timeframe", "direction"],
      },
    },
  ],
};

export const GEMINI_LIVE_TOOLS: Tool[] = [
  chartPlaybookTool,
  logTradeJournalTool,
  autopilotProposalTool,
];
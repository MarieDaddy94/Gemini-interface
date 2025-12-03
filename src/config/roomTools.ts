
import { Tool } from "@google/genai";
import { OpenAIToolSchema } from "../services/OpenAIRealtimeClient";
import {
  chartPlaybookTool,
  logTradeJournalTool,
  autopilotProposalTool,
  controlAppUiTool,
  deskRoundupTool,
  startSessionTool,
  endSessionTool
} from "../services/geminiLiveTools";

// --- OPENAI VERSIONS (Mapped manually for now to match Gemini logic) ---

const openai_get_chart_playbook: OpenAIToolSchema = {
  type: "function",
  name: "get_chart_playbook",
  description: "Fetch strategy playbooks for a symbol/timeframe.",
  parameters: {
    type: "object",
    properties: {
      symbol: { type: "string" },
      timeframe: { type: "string" },
      direction: { type: "string", enum: ["long", "short", "neutral"] }
    },
    required: ["symbol"]
  }
};

const openai_log_trade_journal: OpenAIToolSchema = {
  type: "function",
  name: "log_trade_journal",
  description: "Log a trade or lesson to the journal.",
  parameters: {
    type: "object",
    properties: {
      symbol: { type: "string" },
      direction: { type: "string" },
      outcome: { type: "string" },
      notes: { type: "string" },
      rMultiple: { type: "number" }
    },
    required: ["symbol"]
  }
};

const openai_get_autopilot_proposal: OpenAIToolSchema = {
  type: "function",
  name: "get_autopilot_proposal",
  description: "Generate a risk-checked trade proposal.",
  parameters: {
    type: "object",
    properties: {
      symbol: { type: "string" },
      direction: { type: "string" },
      riskPercent: { type: "number" },
      entryPrice: { type: "number" },
      stopLossPrice: { type: "number" },
      notes: { type: "string" }
    },
    required: ["symbol", "direction"]
  }
};

const openai_desk_roundup: OpenAIToolSchema = {
  type: "function",
  name: "desk_roundup",
  description: "Update desk status, goals, or session phase.",
  parameters: {
    type: "object",
    properties: {
      input: { type: "string", description: "Natural language instruction for the desk." }
    },
    required: ["input"]
  }
};

const openai_control_app_ui: OpenAIToolSchema = {
  type: "function",
  name: "control_app_ui",
  description: "Navigate the app interface.",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["navigate", "overlay", "toast"] },
      target: { type: "string" },
      message: { type: "string" }
    },
    required: ["action"]
  }
};

// --- ROOM CONFIGURATIONS ---

export const GEMINI_ROOM_TOOLS: Record<string, Tool[]> = {
  desk: [
    deskRoundupTool,
    controlAppUiTool,
    startSessionTool,
    endSessionTool,
    autopilotProposalTool // Strategist can propose trades
  ],
  autopilot: [
    autopilotProposalTool,
    chartPlaybookTool, // Execution bot needs playbooks
    controlAppUiTool
  ],
  journal: [
    logTradeJournalTool,
    chartPlaybookTool, // Coach compares vs playbooks
    controlAppUiTool
  ]
};

export const OPENAI_ROOM_TOOLS: Record<string, OpenAIToolSchema[]> = {
  desk: [
    openai_desk_roundup,
    openai_control_app_ui,
    openai_get_autopilot_proposal
  ],
  autopilot: [
    openai_get_autopilot_proposal,
    openai_get_chart_playbook,
    openai_control_app_ui
  ],
  journal: [
    openai_log_trade_journal,
    openai_get_chart_playbook,
    openai_control_app_ui
  ]
};

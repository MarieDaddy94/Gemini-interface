

export type AgentId = "quant_bot" | "trend_master" | "pattern_gpt" | "journal_coach";

export type JournalMode = "live" | "post_trade";

export interface TradeMeta {
  symbol?: string;
  timeframe?: string;
  direction?: "long" | "short";
  rr?: number;              // risk:reward ratio
  entryComment?: string;
  stopLoss?: number;        // price level
  takeProfit1?: number;     // price level
  takeProfit2?: number;     // price level
  confidence?: number;      // 0-100 (%)
}

export interface AgentJournalDraft {
  agentId: AgentId | string;
  agentName: string;
  title: string;
  summary: string;
  sentiment: string;
  tags: string[];
  // Metadata for journal mapping
  symbol?: string;
  direction?: "long" | "short";
  outcome?: "Open" | "Win" | "Loss" | "BE" | string;
  rr?: number;
  pnl?: number;
}

export interface AgentInsight {
  agentId: AgentId | string;
  agentName: string;
  text?: string;
  error?: string;
  journalDraft?: AgentJournalDraft | null;
  tradeMeta?: TradeMeta;
}

export interface AgentDebriefInput {
  agentId: string;
  agentName: string;
  message: string;
  tradeMeta?: TradeMeta;
}

// Safely resolve API URL for Vite/ESM environments
const API_BASE_URL =
  (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000';

/**
 * Call your backend multi-agent endpoint.
 *
 * You can use this inside ChatOverlay when the user sends a message,
 * passing the selected agents, chart context, and optional screenshot.
 */
export async function fetchAgentInsights(params: {
  agentIds: AgentId[];
  userMessage: string;
  chartContext?: any; // Changed from string to any to support object payload
  journalContext?: any[]; // New field
  screenshot?: string | null;
  journalMode?: JournalMode;
}): Promise<AgentInsight[]> {
  const response = await fetch(`${API_BASE_URL}/api/agents/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      agentIds: params.agentIds,
      userMessage: params.userMessage,
      chartContext: params.chartContext || {},
      journalContext: params.journalContext || [],
      screenshot: params.screenshot || null,
      journalMode: params.journalMode || "live",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Agent API error (${response.status}): ${text || response.statusText}`
    );
  }

  const json = await response.json();
  const agents = Array.isArray(json.agents) ? json.agents : [];

  return agents.map((a: any) => ({
    agentId: a.agentId,
    agentName: a.agentName,
    text: a.text,
    error: a.error,
    journalDraft: a.journalDraft || null,
    tradeMeta: a.tradeMeta || null,
  }));
}

/**
 * Trigger a second-round "Roundtable" where agents react to previous insights.
 */
export async function fetchAgentDebrief(params: {
  previousInsights: AgentDebriefInput[];
  chartContext?: any;
  journalContext?: any[];
}): Promise<AgentInsight[]> {
  const response = await fetch(`${API_BASE_URL}/api/agents/debrief`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      previousInsights: params.previousInsights,
      chartContext: params.chartContext || {},
      journalContext: params.journalContext || [],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Agent Debrief error (${response.status}): ${text || response.statusText}`
    );
  }

  const json = await response.json();
  const insights = Array.isArray(json.insights) ? json.insights : [];

  return insights.map((a: any) => ({
    agentId: a.agentId,
    agentName: a.agentName,
    text: a.text,
    error: a.error,
    journalDraft: a.journalDraft || null,
    tradeMeta: a.tradeMeta || null,
  }));
}

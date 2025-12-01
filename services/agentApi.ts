


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

export interface ToolCall {
  toolName: string;
  args: any;
  result: any;
}

export interface AgentInsight {
  agentId: AgentId | string;
  agentName: string;
  text?: string;
  error?: string;
  journalDraft?: AgentJournalDraft | null;
  tradeMeta?: TradeMeta | null;
  toolCalls?: ToolCall[];
}

export interface AgentDebriefInput {
  agentId: string;
  agentName: string;
  message: string;
  tradeMeta?: TradeMeta;
}

export interface AgentConfigOverride {
  provider?: 'gemini' | 'openai';
  model?: string;
  temperature?: number;
}

// Safely resolve API URL for Vite/ESM environments
const API_BASE_URL =
  (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000';

function getAuthHeaders() {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  
  if (typeof window !== 'undefined') {
    const openai = localStorage.getItem('openai_api_key');
    const gemini = localStorage.getItem('gemini_api_key');
    if (openai) headers['x-openai-key'] = openai;
    if (gemini) headers['x-gemini-key'] = gemini;
  }
  
  return headers;
}

/**
 * Call your backend multi-agent endpoint.
 */
export async function fetchAgentInsights(params: {
  agentIds: AgentId[];
  userMessage: string;
  chartContext?: any;
  journalContext?: any[];
  screenshot?: string | null;
  journalMode?: JournalMode;
  agentOverrides?: Record<string, AgentConfigOverride>;
  accountId?: string | null;
}): Promise<AgentInsight[]> {
  const response = await fetch(`${API_BASE_URL}/api/agents/chat`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      agentIds: params.agentIds,
      userMessage: params.userMessage,
      chartContext: params.chartContext || {},
      journalContext: params.journalContext || [],
      screenshot: params.screenshot || null,
      journalMode: params.journalMode || "live",
      agentOverrides: params.agentOverrides,
      accountId: params.accountId
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
    toolCalls: a.toolCalls || []
  }));
}

/**
 * Trigger a second-round "Roundtable" where agents react to previous insights.
 */
export async function fetchAgentDebrief(params: {
  previousInsights: AgentDebriefInput[];
  chartContext?: any;
  journalContext?: any[];
  agentOverrides?: Record<string, AgentConfigOverride>;
  accountId?: string | null;
}): Promise<AgentInsight[]> {
  const response = await fetch(`${API_BASE_URL}/api/agents/debrief`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      previousInsights: params.previousInsights,
      chartContext: params.chartContext || {},
      journalContext: params.journalContext || [],
      agentOverrides: params.agentOverrides,
      accountId: params.accountId
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
    toolCalls: a.toolCalls || []
  }));
}

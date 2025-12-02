
import {
  TradingSessionState,
  AgentMessage,
} from '../types';
import { apiClient } from '../utils/apiClient';

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
  deskState?: any; // NEW: Desk Context
}): Promise<AgentInsight[]> {
  const response = await apiClient.post<{ agents: any[] }>('/api/agents/chat', {
    agentIds: params.agentIds,
    userMessage: params.userMessage,
    chartContext: params.chartContext || {},
    journalContext: params.journalContext || [],
    screenshot: params.screenshot || null,
    journalMode: params.journalMode || "live",
    agentOverrides: params.agentOverrides,
    accountId: params.accountId,
    deskState: params.deskState
  }, {
    headers: getAuthHeaders()
  });

  const agents = Array.isArray(response.agents) ? response.agents : [];

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
  deskState?: any;
}): Promise<AgentInsight[]> {
  const response = await apiClient.post<{ insights: any[] }>('/api/agents/debrief', {
    previousInsights: params.previousInsights,
    chartContext: params.chartContext || {},
    journalContext: params.journalContext || [],
    agentOverrides: params.agentOverrides,
    accountId: params.accountId,
    deskState: params.deskState
  }, {
    headers: getAuthHeaders()
  });

  const insights = Array.isArray(response.insights) ? response.insights : [];

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

// -----------------------------------------------------
// Phase 2: Orchestrator Helper
// -----------------------------------------------------

export interface AgentRouterRequest {
  agentId?: string;
  userMessage: string;
  sessionState: TradingSessionState;
  history?: AgentMessage[];
  deskState?: any; // NEW
}

export interface AgentRouterResponse {
  agentId: string;
  content: string;
  // Updated to include toolCalls returned by the new orchestrator logic
  toolCalls?: ToolCall[];
}

/**
 * Call the backend agent router.
 * This is what your ChatOverlay (or future voice controller) will use.
 */
export async function callAgentRouter(
  payload: AgentRouterRequest
): Promise<AgentRouterResponse> {
  return apiClient.post<AgentRouterResponse>('/api/agent-router', payload, {
    headers: getAuthHeaders()
  });
}

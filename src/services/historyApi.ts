
import { TradingSessionState } from '../types';
import { apiClient } from '../utils/apiClient';

export interface AutopilotHistoryRecord {
  id: string;
  createdAt: number;
  instrumentSymbol: string;
  timeframe: string | null;
  environment: string | null;
  autopilotMode: string | null;
  direction: 'long' | 'short';
  riskPercent: number;
  allowed: boolean;
  recommended: boolean;
  source: string;
  executionStatus: string;
  riskReasons: string[];
  riskWarnings: string[];
  planSummary: string;
  pnl: number | null;
}

export interface AutopilotStats {
  total: number;
  closed: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;
  avgRisk: number;
  avgPnl: number;
  losingStreak: number;
  recentDirectionBias: 'long' | 'short' | null;
  entries: AutopilotHistoryRecord[];
}

export interface CoachResponse {
  stats: AutopilotStats;
  coachNotes: string;
}

export async function logAutopilotHistory(
  entry: any,
  sessionState: TradingSessionState
): Promise<AutopilotHistoryRecord> {
  return apiClient.post<AutopilotHistoryRecord>('/api/history/autopilot/log', {
    entry,
    sessionState,
  });
}

export async function fetchAutopilotCoach(
  sessionState: TradingSessionState
): Promise<CoachResponse> {
  return apiClient.post<CoachResponse>('/api/history/autopilot/coach', {
    sessionState,
  });
}

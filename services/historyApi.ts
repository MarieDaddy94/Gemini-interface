
import { TradingSessionState } from '../types';

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
  const resp = await fetch('/api/history/autopilot/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entry, sessionState }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `History log failed (${resp.status}): ${resp.statusText} - ${text}`
    );
  }

  return (await resp.json()) as AutopilotHistoryRecord;
}

export async function fetchAutopilotCoach(
  sessionState: TradingSessionState
): Promise<CoachResponse> {
  const resp = await fetch('/api/history/autopilot/coach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionState }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `Coach request failed (${resp.status}): ${resp.statusText} - ${text}`
    );
  }

  return (await resp.json()) as CoachResponse;
}

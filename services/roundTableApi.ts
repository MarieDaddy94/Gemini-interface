// services/roundTableApi.ts
//
// Frontend helper for the Trading Squad round-table.

import { TradingSessionState } from '../types';

export interface RoundTableFinalPlan {
  bias: 'long' | 'short' | 'neutral';
  timeframe: string;
  confidence: number;
  narrative: string;
  entryPlan: string;
  riskPlan: string;
  management: string;
  checklist: string;
}

export interface RoundTableTurn {
  speaker: string;
  role: string;
  content: string;
}

export interface RoundTableResponse {
  finalPlan: RoundTableFinalPlan;
  transcript: RoundTableTurn[];
  riskFlags: string[];
  notesForJournal: string[];
}

const API_BASE_URL =
  (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000';

export async function runRoundTablePlan(args: {
  sessionState: TradingSessionState;
  userQuestion: string;
  recentJournal?: any[];
  recentEvents?: any[];
}): Promise<RoundTableResponse> {
  const resp = await fetch(`${API_BASE_URL}/api/roundtable/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionState: args.sessionState,
      userQuestion: args.userQuestion,
      recentJournal: args.recentJournal ?? [],
      recentEvents: args.recentEvents ?? [],
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `Round-table request failed (${resp.status}): ${resp.statusText} - ${text}`
    );
  }

  return (await resp.json()) as RoundTableResponse;
}
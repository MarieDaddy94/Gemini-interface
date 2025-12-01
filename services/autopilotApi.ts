
import { TradingSessionState, ProposedTrade } from '../types';

export interface AutopilotPlanResponse {
  allowed: boolean;
  recommended: boolean;
  planSummary: string;
  riskReasons?: string[];
  riskWarnings?: string[];
}

export interface AutopilotPlanRequest {
  direction: 'long' | 'short';
  riskPercent: number;
  notes?: string;
}

export async function planAutopilotTrade(
  sessionState: TradingSessionState,
  request: AutopilotPlanRequest
): Promise<AutopilotPlanResponse> {
  const proposedTrade: ProposedTrade = {
    instrument: sessionState.instrument,
    direction: request.direction,
    riskPercent: request.riskPercent,
    comment: request.notes
  };

  const response = await fetch('/api/autopilot/plan-trade', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionState,
      proposedTrade,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Autopilot plan failed (${response.status}): ${text}`);
  }

  return response.json();
}

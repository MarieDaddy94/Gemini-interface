// services/riskApi.ts
//
// Frontend helper for risk / autopilot preview.

import {
  TradingSessionState,
  ProposedTrade,
  RiskCheckResult,
} from '../types';

export interface RiskPreviewRequest {
  sessionState: TradingSessionState;
  proposedTrade: ProposedTrade;
}

export interface RiskPreviewResponse {
  allowed: boolean;
  risk: RiskCheckResult;
}

/**
 * Ask the backend to evaluate a proposed trade against current risk rules.
 */
export async function previewProposedTrade(
  payload: RiskPreviewRequest
): Promise<RiskPreviewResponse> {
  const resp = await fetch('/api/risk/preview-trade', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `Risk preview request failed (${resp.status}): ${resp.statusText} - ${text}`
    );
  }

  const json = (await resp.json()) as RiskPreviewResponse;
  return json;
}
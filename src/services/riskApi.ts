
// services/riskApi.ts
//
// Frontend helper for risk / autopilot preview.

import {
  TradingSessionState,
  ProposedTrade,
  RiskCheckResult,
} from '../types';
import { apiClient } from '../utils/apiClient';

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
  return apiClient.post<RiskPreviewResponse>('/api/risk/preview-trade', payload);
}

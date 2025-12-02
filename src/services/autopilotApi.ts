
import { TradingSessionState, ProposedTrade } from '../types';
import { apiClient } from '../utils/apiClient';

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

export type AutopilotProvider = 'standard' | 'gemini';

function mapGeminiPlanToResponse(geminiJson: any): AutopilotPlanResponse {
  const tradePlan = geminiJson.jsonTradePlan || {};
  const isTradeSuggested = tradePlan.symbol && tradePlan.direction;

  return {
    allowed: true,
    recommended: !!isTradeSuggested,
    planSummary: `${geminiJson.summary || ''}\n\nRationale: ${geminiJson.rationale || ''}\n\nRisk Notes: ${geminiJson.riskNotes || ''}`,
    riskReasons: [],
    riskWarnings: geminiJson.warnings || [],
  };
}

export async function planAutopilotTrade(
  sessionState: TradingSessionState,
  request: AutopilotPlanRequest,
  provider: AutopilotProvider = 'standard',
  brokerSnapshot?: any
): Promise<AutopilotPlanResponse> {
  
  if (provider === 'gemini') {
    const payload = {
      symbol: sessionState.instrument.symbol || sessionState.instrument.displayName,
      timeframe: sessionState.timeframe.currentTimeframe,
      mode: sessionState.environment === 'live' ? 'LIVE' : 'SIM',
      question: `Plan a ${request.direction.toUpperCase()} trade with ${request.riskPercent}% risk. Notes: ${request.notes || 'None'}`,
      brokerSnapshot: brokerSnapshot || { 
         balance: sessionState.account.balance || 0,
         equity: sessionState.account.equity || 0,
         openPnl: (sessionState.account.equity || 0) - (sessionState.account.balance || 0)
      },
      riskProfile: 'balanced'
    };

    const json = await apiClient.post<any>('/api/gemini/autopilot/analyze', payload);
    return mapGeminiPlanToResponse(json);
  }

  // Standard flow
  const proposedTrade: ProposedTrade = {
    instrument: sessionState.instrument,
    direction: request.direction,
    riskPercent: request.riskPercent,
    comment: request.notes
  };

  return await apiClient.post<AutopilotPlanResponse>('/api/autopilot/plan-trade', {
    sessionState,
    proposedTrade,
  });
}

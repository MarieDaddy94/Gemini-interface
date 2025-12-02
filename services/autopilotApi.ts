
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

export type AutopilotProvider = 'standard' | 'gemini';

// Helper to map Gemini JSON Plan to AutopilotPlanResponse
function mapGeminiPlanToResponse(geminiJson: any): AutopilotPlanResponse {
  const tradePlan = geminiJson.jsonTradePlan || {};
  const isTradeSuggested = tradePlan.symbol && tradePlan.direction; // Basic check

  return {
    allowed: true, // If Gemini produces a valid plan JSON, we assume it passed its internal reasoning
    recommended: !!isTradeSuggested,
    planSummary: `${geminiJson.summary || ''}\n\nRationale: ${geminiJson.rationale || ''}\n\nRisk Notes: ${geminiJson.riskNotes || ''}`,
    riskReasons: [], // Gemini handles risk internally in the prompt
    riskWarnings: geminiJson.warnings || [],
  };
}

export async function planAutopilotTrade(
  sessionState: TradingSessionState,
  request: AutopilotPlanRequest,
  provider: AutopilotProvider = 'standard',
  brokerSnapshot?: any // Optional: Pass snapshot for Gemini if available
): Promise<AutopilotPlanResponse> {
  
  if (provider === 'gemini') {
    const payload = {
      symbol: sessionState.instrument.symbol || sessionState.instrument.displayName,
      timeframe: sessionState.timeframe.currentTimeframe,
      mode: sessionState.environment === 'live' ? 'LIVE' : 'SIM',
      question: `Plan a ${request.direction.toUpperCase()} trade with ${request.riskPercent}% risk. Notes: ${request.notes || 'None'}`,
      brokerSnapshot: brokerSnapshot || { 
         // Fallback if no snapshot passed
         balance: sessionState.account.balance || 0,
         equity: sessionState.account.equity || 0,
         openPnl: (sessionState.account.equity || 0) - (sessionState.account.balance || 0)
      },
      riskProfile: 'balanced' // Default
    };

    const response = await fetch('/api/gemini/autopilot/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gemini Autopilot plan failed (${response.status}): ${text}`);
    }

    const json = await response.json();
    return mapGeminiPlanToResponse(json);
  }

  // Standard flow (OpenAI / Agent Router)
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

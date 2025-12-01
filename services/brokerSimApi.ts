
import {
  SimAccountInfo,
  SimPosition,
  TradeDirection,
  TradingSessionState,
} from '../types';

export async function getSimAccountInfo(): Promise<SimAccountInfo> {
  const resp = await fetch('/api/broker/sim/account');
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `Sim account fetch failed (${resp.status}): ${resp.statusText} - ${text}`
    );
  }
  return (await resp.json()) as SimAccountInfo;
}

export async function getSimPositions(): Promise<SimPosition[]> {
  const resp = await fetch('/api/broker/sim/positions');
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `Sim positions fetch failed (${resp.status}): ${resp.statusText} - ${text}`
    );
  }
  return (await resp.json()) as SimPosition[];
}

export async function closeSimPositionApi(
  positionId: string,
  closePrice: number
): Promise<SimPosition> {
  const resp = await fetch('/api/broker/sim/close-position', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ positionId, closePrice }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `Sim close position failed (${resp.status}): ${resp.statusText} - ${text}`
    );
  }

  return (await resp.json()) as SimPosition;
}

export interface AutopilotSimExecRequest {
  sessionState: TradingSessionState;
  direction: TradeDirection;
  riskPercent: number;
  notes?: string;
  entryPrice: number;
  stopPrice?: number;
  executeIfRecommended?: boolean;
}

export interface AutopilotSimExecResponse {
  plan: {
    allowed: boolean;
    recommended: boolean;
    planSummary: string;
    riskReasons: string[];
    riskWarnings: string[];
    rawText?: string;
  };
  executed: boolean;
  position?: SimPosition;
  account: SimAccountInfo;
}

export async function executeAutopilotPlanSimApi(
  payload: AutopilotSimExecRequest
): Promise<AutopilotSimExecResponse> {
  const resp = await fetch('/api/autopilot/execute-plan-sim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionState: payload.sessionState,
      tradeRequest: {
        direction: payload.direction,
        riskPercent: payload.riskPercent,
        notes: payload.notes,
      },
      executionParams: {
        entryPrice: payload.entryPrice,
        stopPrice: payload.stopPrice,
        executeIfRecommended: payload.executeIfRecommended ?? true,
      },
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `Autopilot sim exec failed (${resp.status}): ${resp.statusText} - ${text}`
    );
  }

  return (await resp.json()) as AutopilotSimExecResponse;
}

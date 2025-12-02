
import {
  SimAccountInfo,
  SimPosition,
  TradeDirection,
  TradingSessionState,
} from '../types';
import { apiClient } from '../utils/apiClient';

export async function getSimAccountInfo(): Promise<SimAccountInfo> {
  return apiClient.get<SimAccountInfo>('/api/broker/sim/account');
}

export async function getSimPositions(): Promise<SimPosition[]> {
  return apiClient.get<SimPosition[]>('/api/broker/sim/positions');
}

export async function closeSimPositionApi(
  positionId: string,
  closePrice: number
): Promise<SimPosition> {
  return apiClient.post<SimPosition>('/api/broker/sim/close-position', {
    positionId,
    closePrice,
  });
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
  return apiClient.post<AutopilotSimExecResponse>('/api/autopilot/execute-plan-sim', {
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
  });
}

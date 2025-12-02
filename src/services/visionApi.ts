
import { TradingSessionState } from '../types';
import { apiClient } from '../utils/apiClient';

export interface AnalyzeChartRequest {
  fileBase64: string; // Base64 string without data prefix
  mimeType: string;
  sessionState: TradingSessionState;
  question?: string;
}

export interface AnalyzeChartResponse {
  visionSummary: string;
}

export async function analyzeChartImageApi(
  payload: AnalyzeChartRequest
): Promise<AnalyzeChartResponse> {
  return apiClient.post<AnalyzeChartResponse>('/api/vision/analyze', payload);
}


import { TradingSessionState, VisionSnapshot } from '../types';
import { apiClient } from '../utils/apiClient';

export interface AnalyzeChartRequest {
  fileBase64: string; // Base64 string without data prefix
  mimeType: string;
  sessionState?: TradingSessionState; // Optional
  symbol?: string;
  timeframe?: string;
  question?: string;
  provider?: 'gemini' | 'openai' | 'auto';
  source?: 'manual' | 'desk' | 'autopilot';
}

export interface AnalyzeChartResponse {
  visionSummary: string;
  snapshot: VisionSnapshot;
}

export async function analyzeChartImageApi(
  payload: AnalyzeChartRequest
): Promise<AnalyzeChartResponse> {
  return apiClient.post<AnalyzeChartResponse>('/api/vision/analyze', payload);
}

export async function fetchRecentVisionSnapshots(symbol?: string, limit = 5): Promise<VisionSnapshot[]> {
    const params = new URLSearchParams();
    if (symbol) params.append('symbol', symbol);
    params.append('limit', limit.toString());
    const res = await apiClient.get<{ snapshots: VisionSnapshot[] }>(`/api/vision/recent?${params.toString()}`);
    return res.snapshots;
}

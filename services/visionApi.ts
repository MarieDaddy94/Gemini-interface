
import { TradingSessionState } from '../types';

const API_BASE_URL =
  (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000';

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
  const resp = await fetch(`${API_BASE_URL}/api/vision/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `Chart vision request failed (${resp.status}): ${resp.statusText} - ${text}`
    );
  }

  return (await resp.json()) as AnalyzeChartResponse;
}

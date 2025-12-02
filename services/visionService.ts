import type {
  VisionProvider,
  VisionTask,
  VisionContext,
} from '../types';

export interface RunVisionRequest {
  provider?: VisionProvider;      // 'auto' | 'gemini' | 'openai'
  modelId?: string;
  task: VisionTask;
  visionContext?: VisionContext;
  images?: string[];              // base64 or data URLs
}

export interface RunVisionResponse {
  provider: VisionProvider;
  modelId: string;
  task: VisionTask;
  createdAt: string;
  rawText: string;
}

const API_BASE_URL =
  (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000';

export async function runVisionTask(
  req: RunVisionRequest
): Promise<RunVisionResponse> {
  const res = await fetch(`${API_BASE_URL}/api/vision/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vision API failed: ${res.status} ${text}`);
  }

  const json = await res.json();
  return json as RunVisionResponse;
}
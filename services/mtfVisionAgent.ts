
import { ChartVisionAnalysis } from '../types';
import { useVisionSettings } from '../context/VisionSettingsContext';

export interface MtfVisionFrame {
  imageBase64: string;
  timeframe: string;
  note?: string;
}

export interface MtfVisionRequest {
  symbol: string;
  sessionContext?: string;
  question?: string;
  frames: MtfVisionFrame[];
}

export interface MtfVisionResult {
  rawText: string;
  summary: string;
  analysis: ChartVisionAnalysis;
}

export async function runMtfVisionRequest(
  payload: MtfVisionRequest,
  provider: string,
  modelId: string,
): Promise<MtfVisionResult> {
  const res = await fetch('/api/vision/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider,
      modelId,
      mode: 'mtf_vision_v1',
      payload,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MTF vision API error: ${res.status} – ${text}`);
  }

  const data = await res.json();
  const result: MtfVisionResult = {
    rawText: data.rawText ?? '',
    summary: data.summary ?? '',
    analysis: data.analysis,
  };
  return result;
}

export function useMtfVisionAgent() {
  const { settings } = useVisionSettings();

  const analyzeMultiTimeframe = async (
    req: MtfVisionRequest,
  ): Promise<MtfVisionResult> => {
    const selectedProvider = settings.provider === 'auto' ? 'gemini' : settings.provider;
    const selectedVisionModelId = selectedProvider === 'gemini'
      ? settings.defaultGeminiModel
      : settings.defaultOpenAIModel;

    if (!selectedVisionModelId) {
      throw new Error('No vision provider/model selected in Vision Settings.');
    }
    return runMtfVisionRequest(req, selectedProvider, selectedVisionModelId);
  };

  return { analyzeMultiTimeframe };
}

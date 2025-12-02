
import { LiveWatchPlan, LiveWatchResult } from '../types';
import { useVisionSettings } from '../context/VisionSettingsContext';

export interface LiveWatchRequest {
  imageBase64: string;
  plan: LiveWatchPlan;
  lastStatus?: string;
}

export async function runLiveWatchRequest(
  payload: LiveWatchRequest,
  provider: string,
  modelId: string,
): Promise<LiveWatchResult> {
  const res = await fetch('/api/vision/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider,
      modelId,
      mode: 'live_watch_v1',
      payload,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Live watch API error: ${res.status} – ${text}`);
  }

  const data = await res.json();
  const result: LiveWatchResult = {
    rawText: data.rawText ?? '',
    plan: data.plan,
    analysis: data.analysis,
  };
  return result;
}

export function useLiveWatchAgent() {
  const { settings } = useVisionSettings();

  const evaluateSnapshot = async (
    req: LiveWatchRequest,
  ): Promise<LiveWatchResult> => {
    const selectedProvider = settings.provider === 'auto' ? 'gemini' : settings.provider;
    const selectedVisionModelId = selectedProvider === 'gemini'
      ? settings.defaultGeminiModel
      : settings.defaultOpenAIModel;

    if (!selectedVisionModelId) {
      throw new Error('No vision provider/model selected in Vision Settings.');
    }
    return runLiveWatchRequest(req, selectedProvider, selectedVisionModelId);
  };

  return { evaluateSnapshot };
}


import { JournalVisionResult } from '../types';
import { useVisionSettings } from '../context/VisionSettingsContext';

export interface JournalVisionRequest {
  imageBase64: string;
  contextNote?: string;
}

export async function runJournalVisionRequest(
  payload: JournalVisionRequest,
  provider: string,
  modelId: string,
): Promise<JournalVisionResult> {
  const res = await fetch('/api/vision/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider,
      modelId,
      mode: 'journal_vision_v1',
      payload,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Journal vision API error: ${res.status} – ${text}`);
  }

  const data = await res.json();
  return {
    rawText: data.rawText ?? '',
    summary: data.summary ?? '',
    analysis: data.analysis,
  };
}

export function useJournalVisionAgent() {
  const { selectedProvider, selectedVisionModelId } = useVisionSettings();

  const analyzeJournalScreenshot = async (
    req: JournalVisionRequest,
  ): Promise<JournalVisionResult> => {
    if (!selectedProvider || !selectedVisionModelId) {
      throw new Error('No vision provider/model selected in Vision Settings.');
    }
    return runJournalVisionRequest(req, selectedProvider, selectedVisionModelId);
  };

  return { analyzeJournalScreenshot };
}

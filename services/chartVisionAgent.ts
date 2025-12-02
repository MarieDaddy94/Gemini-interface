
import { VisionResult } from '../types';
import { useVisionSettings } from '../context/VisionSettingsContext';

export interface ChartVisionRequest {
  imageBase64: string;  // data URL without the `data:image/...` prefix is OK
  symbol: string;
  timeframe: string;
  sessionContext?: string;
  question?: string;

  // Optional toggles so the model knows what to emphasize
  focusLiquidity?: boolean;
  focusFvg?: boolean;
  focusTrendStructure?: boolean;
  focusRiskWarnings?: boolean;
}

/**
 * Low-level call to the backend /api/vision/run endpoint.
 */
export async function runChartVisionRequest(
  payload: ChartVisionRequest,
  provider: string,
  modelId: string,
): Promise<VisionResult> {
  const res = await fetch('/api/vision/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider,
      modelId,
      mode: 'chart_vision_v1',
      task: 'chart_vision_v1',
      payload, // send specialized payload
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vision API error: ${res.status} – ${text}`);
  }

  const data = await res.json();

  const result: VisionResult = {
    rawText: data.rawText ?? (typeof data === 'string' ? data : JSON.stringify(data)),
    summary: data.summary ?? 'Model did not return a structured summary.',
    analysis: data.analysis ?? {
      symbol: payload.symbol,
      timeframe: payload.timeframe,
      sessionContext: payload.sessionContext,
      marketBias: 'unclear',
      confidence: 0,
      structureNotes: data.rawText ?? '',
      liquidityNotes: '',
      fvgNotes: '',
      keyZones: [],
      patternNotes: '',
      riskWarnings: [],
      suggestedPlaybookTags: [],
    },
  };

  return result;
}

/**
 * React hook that knows how to call the agent using current vision settings.
 */
export function useChartVisionAgent() {
  const { settings } = useVisionSettings();

  const analyzeChart = async (req: ChartVisionRequest): Promise<VisionResult> => {
    // Logic to determine active model based on provider settings
    const selectedProvider = settings.provider === 'auto' ? 'gemini' : settings.provider; 
    const selectedVisionModelId = selectedProvider === 'gemini' 
       ? settings.defaultGeminiModel 
       : settings.defaultOpenAIModel;

    if (!selectedVisionModelId) {
      throw new Error('No vision model selected in Vision Settings.');
    }
    return runChartVisionRequest(req, selectedProvider, selectedVisionModelId);
  };

  return { analyzeChart };
}

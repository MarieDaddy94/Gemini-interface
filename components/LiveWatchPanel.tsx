
import React, { useState, ChangeEvent, FormEvent } from 'react';
import { useVisionSettings } from '../context/VisionSettingsContext';
import { useLiveWatchAgent } from '../services/liveWatchService';
import { LiveWatchPlan, LiveWatchResult } from '../types';

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        const commaIndex = result.indexOf(',');
        if (commaIndex >= 0) {
          resolve(result.slice(commaIndex + 1));
        } else {
          resolve(result);
        }
      } else {
        reject(new Error('Unexpected file reader result'));
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });

const LiveWatchPanel: React.FC = () => {
  const { settings } = useVisionSettings();
  const { evaluateSnapshot } = useLiveWatchAgent();

  const selectedProvider = settings.provider === 'auto' ? 'gemini' : settings.provider;
  const selectedVisionModelId = selectedProvider === 'gemini'
    ? settings.defaultGeminiModel
    : settings.defaultOpenAIModel;

  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  const [plan, setPlan] = useState<LiveWatchPlan>({
    direction: 'long',
    symbol: 'US30',
    timeframe: '1m',
    entryPrice: undefined,
    entryZoneLow: undefined,
    entryZoneHigh: undefined,
    stopLossPrice: 0,
    takeProfitPrice: undefined,
  } as any);

  const [lastStatus, setLastStatus] = useState<string>('not_reached');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LiveWatchResult | null>(null);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setImageBase64(null);
      setImagePreviewUrl(null);
      return;
    }
    try {
      const base64 = await fileToBase64(file);
      const url = URL.createObjectURL(file);
      setImageBase64(base64);
      setImagePreviewUrl(url);
    } catch (err: any) {
      console.error(err);
      setError('Could not read image file.');
    }
  };

  const handlePlanChange = (field: keyof LiveWatchPlan, value: string) => {
    setPlan(prev => {
      const parsed =
        field === 'entryPrice' ||
        field === 'entryZoneLow' ||
        field === 'entryZoneHigh' ||
        field === 'stopLossPrice' ||
        field === 'takeProfitPrice'
          ? (value ? parseFloat(value) : undefined)
          : value;
      return { ...prev, [field]: parsed } as any;
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!imageBase64) {
      setError('Upload a live chart screenshot first.');
      return;
    }
    if (!selectedProvider || !selectedVisionModelId) {
      setError('Select a vision provider/model in Vision Settings first.');
      return;
    }
    if (!plan.stopLossPrice) {
      setError('Stop loss price is required for live watch.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await evaluateSnapshot({
        imageBase64,
        plan,
        lastStatus,
      });
      setResult(res);
      setLastStatus(res.analysis.status);
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? 'Error running live watch.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 h-full overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-800 pb-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-200">Vision Live Watch</h2>
          <p className="text-xs text-gray-500">
            Feed a screenshot + trade plan, and let the vision agent tell you if the idea is still
            valid, just triggered, in play, or dead.
          </p>
        </div>
        <div className="text-xs text-gray-500 text-right">
          <div>Provider: <span className="font-medium text-gray-300">{selectedProvider ?? '—'}</span></div>
          <div>Model: <span className="font-medium text-gray-300">{selectedVisionModelId ?? '—'}</span></div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-4 flex-1 min-h-0">
        {/* Left: screenshot + plan */}
        <div className="md:w-1/2 flex flex-col gap-3 overflow-y-auto pr-1">
          <div>
            <label className="block text-[10px] font-medium text-gray-400 mb-1">Live chart screenshot</label>
            <input 
              type="file" 
              accept="image/*" 
              onChange={handleFileChange} 
              className="text-[10px] text-gray-400 file:mr-2 file:py-0.5 file:px-2 file:rounded file:border-0 file:text-[9px] file:bg-gray-800 file:text-gray-300"
            />
            {imagePreviewUrl && (
              <img
                src={imagePreviewUrl}
                alt="Live chart"
                className="mt-2 max-h-48 rounded border border-gray-700 object-contain"
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-gray-400 mb-1">Symbol</label>
              <input
                value={plan.symbol}
                onChange={e => handlePlanChange('symbol', e.target.value)}
                className="w-full bg-[#101018] border border-gray-700 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-[#2962ff]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-400 mb-1">Timeframe</label>
              <input
                value={plan.timeframe}
                onChange={e => handlePlanChange('timeframe', e.target.value)}
                className="w-full bg-[#101018] border border-gray-700 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-[#2962ff]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-gray-400 mb-1">Direction</label>
              <select
                value={plan.direction}
                onChange={e => handlePlanChange('direction', e.target.value)}
                className="w-full bg-[#101018] border border-gray-700 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-[#2962ff]"
              >
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-400 mb-1">Last status</label>
              <select
                value={lastStatus}
                onChange={e => setLastStatus(e.target.value)}
                className="w-full bg-[#101018] border border-gray-700 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-[#2962ff]"
              >
                <option value="not_reached">not_reached</option>
                <option value="just_touched">just_touched</option>
                <option value="in_play">in_play</option>
                <option value="invalidated">invalidated</option>
                <option value="tp_hit">tp_hit</option>
                <option value="sl_hit">sl_hit</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-gray-400 mb-1">Entry price</label>
              <input
                type="number"
                value={plan.entryPrice ?? ''}
                onChange={e => handlePlanChange('entryPrice', e.target.value)}
                className="w-full bg-[#101018] border border-gray-700 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-[#2962ff]"
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-400 mb-1">Stop loss</label>
              <input
                type="number"
                value={plan.stopLossPrice}
                onChange={e => handlePlanChange('stopLossPrice', e.target.value)}
                className="w-full bg-[#101018] border border-gray-700 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-[#2962ff]"
                required
                placeholder="Required"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-gray-400 mb-1">Zone low</label>
              <input
                type="number"
                value={plan.entryZoneLow ?? ''}
                onChange={e => handlePlanChange('entryZoneLow', e.target.value)}
                className="w-full bg-[#101018] border border-gray-700 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-[#2962ff]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-400 mb-1">Zone high</label>
              <input
                type="number"
                value={plan.entryZoneHigh ?? ''}
                onChange={e => handlePlanChange('entryZoneHigh', e.target.value)}
                className="w-full bg-[#101018] border border-gray-700 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-[#2962ff]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-400 mb-1">Take profit</label>
              <input
                type="number"
                value={plan.takeProfitPrice ?? ''}
                onChange={e => handlePlanChange('takeProfitPrice', e.target.value)}
                className="w-full bg-[#101018] border border-gray-700 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-[#2962ff]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="mt-1 w-full flex items-center justify-center px-3 py-2 text-xs font-bold uppercase tracking-wide rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Evaluating…' : 'Evaluate snapshot with Vision'}
          </button>

          {error && <p className="text-[10px] text-red-400 mt-1">{error}</p>}
        </div>

        {/* Right: status output */}
        <div className="md:w-1/2 flex flex-col border border-gray-800 rounded bg-[#101018] overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-800 bg-[#161a25]">
             <h3 className="text-xs font-semibold text-gray-300">Live Watch Status</h3>
          </div>

          <div className="flex-1 overflow-auto p-3 text-[11px] text-gray-300">
            {!result && !isLoading && (
              <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-50">
                <p>Upload screenshot to check plan status.</p>
              </div>
            )}

            {isLoading && (
               <div className="h-full flex flex-col items-center justify-center text-gray-400">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                  <p>Analyzing live chart...</p>
               </div>
            )}

            {result && (
              <div className="flex flex-col gap-3">
                <div className="p-3 bg-[#1e222d] border border-gray-700 rounded flex flex-col gap-1 items-center">
                  <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Status</div>
                  <div className={`text-lg font-bold ${
                      result.analysis.status === 'in_play' || result.analysis.status === 'tp_hit' ? 'text-green-400' :
                      result.analysis.status === 'sl_hit' || result.analysis.status === 'invalidated' ? 'text-red-400' :
                      'text-yellow-400'
                  }`}>
                    {result.analysis.status.toUpperCase().replace('_', ' ')}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-semibold text-gray-400 mb-1">Commentary</div>
                  <p className="text-gray-200 leading-snug">{result.analysis.comment}</p>
                </div>

                {result.analysis.autopilotHint && (
                  <div className="p-2 bg-blue-900/20 border border-blue-800/40 rounded">
                    <div className="text-[10px] font-semibold text-blue-300 mb-1">Autopilot Suggestion</div>
                    <p className="text-blue-100 font-medium">{result.analysis.autopilotHint}</p>
                  </div>
                )}

                <details className="mt-2">
                  <summary className="cursor-pointer text-[9px] text-gray-500 hover:text-gray-300">
                    Raw JSON
                  </summary>
                  <pre className="mt-1 whitespace-pre-wrap text-[9px] font-mono bg-black/40 text-gray-500 p-2 rounded max-h-32 overflow-auto">
{result.rawText}
                  </pre>
                </details>
              </div>
            )}
          </div>
        </div>
      </form>
    </div>
  );
};

export default LiveWatchPanel;

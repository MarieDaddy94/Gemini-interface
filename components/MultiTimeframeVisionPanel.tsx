
import React, { useState, ChangeEvent, FormEvent } from 'react';
import { useMtfVisionAgent, MtfVisionFrame } from '../services/mtfVisionAgent';
import { useVisionSettings } from '../context/VisionSettingsContext';
import { ChartVisionAnalysis } from '../types';

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

interface FrameState {
  file?: File;
  previewUrl?: string;
  timeframe: string;
  note: string;
  base64?: string;
}

const defaultFrames: FrameState[] = [
  { timeframe: '4H', note: 'HTF context', previewUrl: undefined, base64: undefined },
  { timeframe: '1H', note: 'Intermediate TF', previewUrl: undefined, base64: undefined },
  { timeframe: '15m', note: 'Setup timeframe', previewUrl: undefined, base64: undefined },
  { timeframe: '1m', note: 'Execution timeframe', previewUrl: undefined, base64: undefined },
];

const MultiTimeframeVisionPanel: React.FC = () => {
  const { settings } = useVisionSettings();
  const { analyzeMultiTimeframe } = useMtfVisionAgent();

  const selectedProvider = settings.provider === 'auto' ? 'gemini' : settings.provider;
  const selectedVisionModelId = selectedProvider === 'gemini'
    ? settings.defaultGeminiModel
    : settings.defaultOpenAIModel;

  const [symbol, setSymbol] = useState('US30');
  const [sessionContext, setSessionContext] = useState(
    'NY session, high volatility, prior day high/low marked',
  );
  const [question, setQuestion] = useState(
    'Tell me HTF bias, LTF state inside that, key zones across TFs, and whether continuation or reversal is higher probability.',
  );

  const [frames, setFrames] = useState<FrameState[]>(defaultFrames);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ChartVisionAnalysis | null>(null);
  const [rawText, setRawText] = useState<string | null>(null);

  const updateFrameFile = async (index: number, file: File | undefined) => {
    if (!file) {
      setFrames(prev => {
        const copy = [...prev];
        copy[index] = {
          ...copy[index],
          file: undefined,
          previewUrl: undefined,
          base64: undefined,
        };
        return copy;
      });
      return;
    }

    try {
      const base64 = await fileToBase64(file);
      const url = URL.createObjectURL(file);
      setFrames(prev => {
        const copy = [...prev];
        copy[index] = {
          ...copy[index],
          file,
          previewUrl: url,
          base64,
        };
        return copy;
      });
    } catch (err: any) {
      console.error(err);
      setError('Could not read image file.');
    }
  };

  const handleFileChange = (index: number) => async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    await updateFrameFile(index, file);
  };

  const handleTimeframeChange = (index: number, value: string) => {
    setFrames(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], timeframe: value };
      return copy;
    });
  };

  const handleNoteChange = (index: number, value: string) => {
    setFrames(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], note: value };
      return copy;
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSummary(null);
    setAnalysis(null);
    setRawText(null);

    if (!selectedProvider || !selectedVisionModelId) {
      setError('Select a vision provider and model in Vision Settings first.');
      return;
    }

    const preparedFrames: MtfVisionFrame[] = frames
      .filter(f => !!f.base64)
      .map(f => ({
        imageBase64: f.base64!,
        timeframe: f.timeframe,
        note: f.note,
      }));

    if (preparedFrames.length === 0) {
      setError('Upload at least one timeframe screenshot.');
      return;
    }

    setIsLoading(true);
    try {
      const result = await analyzeMultiTimeframe({
        symbol,
        sessionContext,
        question,
        frames: preparedFrames,
      });
      setSummary(result.summary);
      setAnalysis(result.analysis);
      setRawText(result.rawText);
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? 'Error running multi-timeframe vision.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 h-full overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-800 pb-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-200">Multi-Timeframe Vision</h2>
          <p className="text-xs text-gray-500">
            Upload chart screenshots (e.g. 4H, 1H, 15m, 1m) for HTF/LTF alignment analysis.
          </p>
        </div>
        <div className="text-xs text-gray-500 text-right">
          <div>Provider: <span className="font-medium text-gray-300">{selectedProvider ?? '—'}</span></div>
          <div>Model: <span className="font-medium text-gray-300">{selectedVisionModelId ?? '—'}</span></div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 flex-1 min-h-0">
        {/* Left: frames + settings */}
        <form onSubmit={handleSubmit} className="md:w-1/2 flex flex-col gap-3 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-gray-400 mb-1">Symbol</label>
              <input
                value={symbol}
                onChange={e => setSymbol(e.target.value)}
                className="w-full bg-[#101018] border border-gray-700 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-[#2962ff]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-400 mb-1">Session context</label>
              <input
                value={sessionContext}
                onChange={e => setSessionContext(e.target.value)}
                className="w-full bg-[#101018] border border-gray-700 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-[#2962ff]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-medium text-gray-400 mb-1">Question / instructions</label>
            <textarea
              value={question}
              onChange={e => setQuestion(e.target.value)}
              rows={2}
              className="w-full bg-[#101018] border border-gray-700 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-[#2962ff] resize-none"
            />
          </div>

          <div className="space-y-3">
            {frames.map((frame, idx) => (
              <div key={idx} className="border border-gray-700 rounded p-2 flex flex-col gap-2 bg-[#161a25]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold text-gray-300">
                    Frame {idx + 1}
                  </span>
                  <input
                    type="text"
                    value={frame.timeframe}
                    onChange={e => handleTimeframeChange(idx, e.target.value)}
                    className="w-20 bg-[#101018] border border-gray-700 rounded px-1 py-0.5 text-[10px] text-center"
                    placeholder="TF"
                  />
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange(idx)}
                  className="text-[10px] text-gray-400 file:mr-2 file:py-0.5 file:px-2 file:rounded file:border-0 file:text-[9px] file:bg-gray-800 file:text-gray-300"
                />
                {frame.previewUrl && (
                  <img
                    src={frame.previewUrl}
                    alt={`Frame ${idx + 1}`}
                    className="mt-1 max-h-24 object-contain rounded border border-gray-700"
                  />
                )}
                <textarea
                  value={frame.note}
                  onChange={e => handleNoteChange(idx, e.target.value)}
                  rows={1}
                  className="w-full bg-[#101018] border border-gray-700 rounded px-2 py-1 text-[10px] resize-none"
                  placeholder="Note (optional)"
                />
              </div>
            ))}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="mt-1 w-full flex items-center justify-center px-3 py-2 text-xs font-bold uppercase tracking-wide rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Analyzing MTF…' : 'Analyze multi-timeframe'}
          </button>

          {error && <p className="text-[10px] text-red-400 mt-1">{error}</p>}
        </form>

        {/* Right: output */}
        <div className="md:w-1/2 flex flex-col border border-gray-800 rounded bg-[#101018] overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-800 bg-[#161a25]">
             <h3 className="text-xs font-semibold text-gray-300">MTF Vision Output</h3>
          </div>

          <div className="flex-1 overflow-auto p-3 text-[11px] text-gray-300">
            {!analysis && !isLoading && (
              <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-50">
                <p>Upload frames and analyze.</p>
              </div>
            )}

            {isLoading && (
               <div className="h-full flex flex-col items-center justify-center text-gray-400">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                  <p>Processing multiple charts...</p>
               </div>
            )}

            {analysis && (
              <div className="flex flex-col gap-3">
                {summary && (
                  <div className="p-2 bg-[#1e222d] border border-gray-700 rounded">
                    <div className="text-[9px] uppercase font-bold text-gray-500 mb-1">Summary</div>
                    <p className="text-gray-200 leading-snug">{summary}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 bg-[#1e222d] border border-gray-700 rounded">
                    <div className="text-[9px] uppercase font-bold text-gray-500">Primary TF</div>
                    <div className="text-xs font-bold text-white">{analysis.timeframe}</div>
                  </div>
                  <div className="p-2 bg-[#1e222d] border border-gray-700 rounded">
                    <div className="text-[9px] uppercase font-bold text-gray-500">Alignment</div>
                    <div className="text-xs font-bold text-white">
                      {typeof analysis.alignmentScore === 'number' ? `${Math.round(analysis.alignmentScore * 100)}%` : 'N/A'}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 bg-[#1e222d] border border-gray-700 rounded">
                    <div className="text-[9px] uppercase font-bold text-gray-500">HTF Bias</div>
                    <div className="text-xs text-white">{analysis.htfBias?.toUpperCase() || 'N/A'}</div>
                  </div>
                  <div className="p-2 bg-[#1e222d] border border-gray-700 rounded">
                    <div className="text-[9px] uppercase font-bold text-gray-500">LTF Bias</div>
                    <div className="text-xs text-white">{analysis.ltfBias?.toUpperCase() || 'N/A'}</div>
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-semibold text-gray-400 mb-1">Structure Narrative</div>
                  <p className="text-gray-300 leading-snug">{analysis.structureNotes}</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                   <div>
                      <div className="text-[10px] font-semibold text-gray-400 mb-1">Liquidity</div>
                      <p className="text-gray-300 leading-snug">{analysis.liquidityNotes}</p>
                   </div>
                   <div>
                      <div className="text-[10px] font-semibold text-gray-400 mb-1">FVG / Imbalances</div>
                      <p className="text-gray-300 leading-snug">{analysis.fvgNotes}</p>
                   </div>
                </div>

                {analysis.notesByTimeframe && analysis.notesByTimeframe.length > 0 && (
                  <div className="bg-[#161a25] p-2 rounded border border-gray-800">
                    <div className="text-[10px] font-semibold text-gray-400 mb-1">Notes by Timeframe</div>
                    <ul className="space-y-1">
                      {analysis.notesByTimeframe.map((n, idx) => (
                        <li key={idx} className="flex gap-2">
                          <span className="font-bold text-white min-w-[30px]">{n.timeframe}:</span>
                          <span className="text-gray-300">{n.notes}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {analysis.keyZones.length > 0 && (
                  <div>
                    <div className="text-[10px] font-semibold text-gray-400 mb-1">Key Zones</div>
                    <div className="flex flex-wrap gap-1">
                      {analysis.keyZones.map((z, idx) => (
                        <span key={idx} className="px-1.5 py-0.5 bg-purple-900/30 text-purple-200 border border-purple-800/50 rounded text-[9px]">{z}</span>
                      ))}
                    </div>
                  </div>
                )}

                {analysis.riskWarnings.length > 0 && (
                  <div className="bg-red-900/10 border border-red-900/30 p-2 rounded">
                    <div className="text-[10px] font-semibold text-red-400 mb-1">Risk Warnings</div>
                    <ul className="list-disc list-inside text-red-200/80">
                      {analysis.riskWarnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {rawText && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-[9px] text-gray-500 hover:text-gray-300">
                      Raw JSON
                    </summary>
                    <pre className="mt-1 whitespace-pre-wrap text-[9px] font-mono bg-black/40 text-gray-500 p-2 rounded max-h-32 overflow-auto">
{rawText}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MultiTimeframeVisionPanel;


import React, { useState, ChangeEvent, FormEvent } from 'react';
import { useChartVisionAgent, ChartVisionRequest } from '../services/chartVisionAgent';
import { VisionResult } from '../types';
import { useVisionSettings } from '../context/VisionSettingsContext';

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        // data URL like: data:image/png;base64,AAAA...
        const commaIndex = result.indexOf(',');
        if (commaIndex >= 0) {
          resolve(result.slice(commaIndex + 1)); // strip "data:..." prefix
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
};

const ChartVisionAgentPanel: React.FC = () => {
  const { settings } = useVisionSettings();
  const { analyzeChart } = useChartVisionAgent();

  const selectedProvider = settings.provider === 'auto' ? 'gemini' : settings.provider;
  const selectedVisionModelId = selectedProvider === 'gemini' 
     ? settings.defaultGeminiModel 
     : settings.defaultOpenAIModel;

  const [symbol, setSymbol] = useState('US30');
  const [timeframe, setTimeframe] = useState('1m');
  const [sessionContext, setSessionContext] = useState('NY session, high volatility');
  const [question, setQuestion] = useState(
    'Tell me the current bias, key liquidity levels, any FVGs, and the highest probability playbook setup.',
  );

  const [focusLiquidity, setFocusLiquidity] = useState(true);
  const [focusFvg, setFocusFvg] = useState(true);
  const [focusTrendStructure, setFocusTrendStructure] = useState(true);
  const [focusRiskWarnings, setFocusRiskWarnings] = useState(true);

  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VisionResult | null>(null);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setError(null);
      const base64 = await fileToBase64(file);
      setImageBase64(base64);
      setImagePreviewUrl(URL.createObjectURL(file));
    } catch (err: any) {
      console.error(err);
      setError('Could not read image file.');
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!imageBase64) {
      setError('Please upload a chart screenshot first.');
      return;
    }
    if (!selectedProvider || !selectedVisionModelId) {
      setError('Select a vision provider/model in Vision Settings first.');
      return;
    }

    const payload: ChartVisionRequest = {
      imageBase64,
      symbol,
      timeframe,
      sessionContext,
      question,
      focusLiquidity,
      focusFvg,
      focusTrendStructure,
      focusRiskWarnings,
    };

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await analyzeChart(payload);
      setResult(res);
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? 'Error running chart vision.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 h-full bg-[#050509] text-gray-100 p-2 overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-800 pb-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300">Chart Vision – Pattern GPT v1</h2>
          <p className="text-[10px] text-gray-500 mt-0.5">
            Upload a chart and let the vision agent read structure, liquidity and FVGs.
          </p>
        </div>
        <div className="text-[10px] text-gray-500 text-right">
          <div>Engine: <span className="font-medium text-gray-300">{selectedProvider ?? '—'}</span></div>
          <div>Model: <span className="font-medium text-gray-300">{selectedVisionModelId ?? '—'}</span></div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 flex-1 min-h-0">
        {/* Left: Inputs */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 md:w-1/3 overflow-y-auto pr-1">
          <div>
            <label className="block text-[10px] font-medium text-gray-400 mb-1">Chart screenshot</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="block w-full text-[10px] text-gray-300 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-[10px] file:font-semibold file:bg-gray-800 file:text-gray-300 hover:file:bg-gray-700"
            />
            {imagePreviewUrl && (
              <img
                src={imagePreviewUrl}
                alt="Chart preview"
                className="mt-2 max-h-32 w-auto rounded border border-gray-700 object-contain"
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-gray-400 mb-1">Symbol</label>
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="w-full bg-[#101018] border border-gray-700 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-[#2962ff]"
                placeholder="US30"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-400 mb-1">Timeframe</label>
              <input
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                className="w-full bg-[#101018] border border-gray-700 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-[#2962ff]"
                placeholder="1m"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-medium text-gray-400 mb-1">Session & context</label>
            <textarea
              value={sessionContext}
              onChange={(e) => setSessionContext(e.target.value)}
              rows={2}
              className="w-full bg-[#101018] border border-gray-700 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-[#2962ff] resize-none"
              placeholder="Context..."
            />
          </div>

          <div>
            <label className="block text-[10px] font-medium text-gray-400 mb-1">Instructions</label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
              className="w-full bg-[#101018] border border-gray-700 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-[#2962ff]"
              placeholder="Question..."
            />
          </div>

          <div className="bg-[#101018] rounded p-2 border border-gray-800">
            <label className="block text-[10px] font-medium text-gray-400 mb-2">Focus Areas</label>
            <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-300">
              <label className="inline-flex items-center gap-1 cursor-pointer hover:text-white">
                <input
                  type="checkbox"
                  checked={focusTrendStructure}
                  onChange={(e) => setFocusTrendStructure(e.target.checked)}
                  className="accent-[#2962ff]"
                />
                <span>Structure</span>
              </label>
              <label className="inline-flex items-center gap-1 cursor-pointer hover:text-white">
                <input
                  type="checkbox"
                  checked={focusLiquidity}
                  onChange={(e) => setFocusLiquidity(e.target.checked)}
                  className="accent-[#2962ff]"
                />
                <span>Liquidity</span>
              </label>
              <label className="inline-flex items-center gap-1 cursor-pointer hover:text-white">
                <input
                  type="checkbox"
                  checked={focusFvg}
                  onChange={(e) => setFocusFvg(e.target.checked)}
                  className="accent-[#2962ff]"
                />
                <span>FVG</span>
              </label>
              <label className="inline-flex items-center gap-1 cursor-pointer hover:text-white">
                <input
                  type="checkbox"
                  checked={focusRiskWarnings}
                  onChange={(e) => setFocusRiskWarnings(e.target.checked)}
                  className="accent-[#2962ff]"
                />
                <span>Risk</span>
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="mt-1 w-full flex items-center justify-center px-3 py-2 text-xs font-bold uppercase tracking-wide rounded bg-[#2962ff] hover:bg-[#1e53e5] text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-blue-500/20"
          >
            {isLoading ? 'Analyzing Chart...' : 'Analyze'}
          </button>

          {error && <p className="text-[10px] text-red-400 mt-1 bg-red-500/10 p-2 rounded border border-red-500/20">{error}</p>}
        </form>

        {/* Right: Output */}
        <div className="md:w-2/3 flex flex-col border border-gray-800 rounded bg-[#101018] overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-800 bg-[#161a25]">
             <h3 className="text-xs font-semibold text-gray-300">Vision Output</h3>
          </div>
          
          <div className="flex-1 overflow-auto p-3 text-[11px] text-gray-300">
            {!result && !isLoading && (
              <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-50">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <p className="mt-2">Waiting for analysis...</p>
              </div>
            )}

            {isLoading && (
               <div className="h-full flex flex-col items-center justify-center text-gray-400">
                  <div className="w-6 h-6 border-2 border-[#2962ff] border-t-transparent rounded-full animate-spin mb-2"></div>
                  <p>Reading chart structure...</p>
               </div>
            )}

            {result && result.analysis && (
              <div className="flex flex-col gap-4">
                <div className="p-2 bg-[#1e222d] border border-gray-700 rounded">
                  <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Summary</div>
                  <p className="text-gray-200 leading-relaxed">{result.summary}</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-2 bg-[#1e222d] border border-gray-700 rounded">
                    <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Bias</div>
                    <div className="text-sm font-bold text-white">
                      {result.analysis.marketBias?.toUpperCase() || 'UNCLEAR'} 
                      <span className="text-gray-500 text-xs font-normal ml-2">
                        {((result.analysis.confidence || 0) * 100).toFixed(0)}% conf
                      </span>
                    </div>
                  </div>
                  <div className="p-2 bg-[#1e222d] border border-gray-700 rounded">
                    <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Context</div>
                    <div className="text-xs text-white">
                      {result.analysis.symbol} – {result.analysis.timeframe}
                    </div>
                  </div>
                </div>

                {result.analysis.sessionContext && (
                  <div>
                    <div className="font-semibold text-gray-400 mb-1">Session Context</div>
                    <p className="text-gray-300">{result.analysis.sessionContext}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div>
                      <div className="font-semibold text-gray-400 mb-1 border-b border-gray-700 pb-1">Structure</div>
                      <p className="whitespace-pre-wrap">{result.analysis.structureNotes}</p>
                   </div>
                   <div>
                      <div className="font-semibold text-gray-400 mb-1 border-b border-gray-700 pb-1">Patterns</div>
                      <p className="whitespace-pre-wrap">{result.analysis.patternNotes}</p>
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div>
                      <div className="font-semibold text-gray-400 mb-1 border-b border-gray-700 pb-1">Liquidity</div>
                      <p className="whitespace-pre-wrap">{result.analysis.liquidityNotes}</p>
                   </div>
                   <div>
                      <div className="font-semibold text-gray-400 mb-1 border-b border-gray-700 pb-1">FVG / Imbalance</div>
                      <p className="whitespace-pre-wrap">{result.analysis.fvgNotes}</p>
                   </div>
                </div>

                {result.analysis.keyZones && result.analysis.keyZones.length > 0 && (
                  <div>
                    <div className="font-semibold text-gray-400 mb-1">Key Zones</div>
                    <ul className="list-disc list-inside text-gray-300">
                      {result.analysis.keyZones.map((z, idx) => (
                        <li key={idx}>{z}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.analysis.riskWarnings && result.analysis.riskWarnings.length > 0 && (
                  <div className="bg-red-900/20 border border-red-900/40 p-2 rounded">
                    <div className="font-semibold text-red-400 mb-1">Risk Warnings</div>
                    <ul className="list-disc list-inside text-red-200">
                      {result.analysis.riskWarnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.analysis.suggestedPlaybookTags && result.analysis.suggestedPlaybookTags.length > 0 && (
                  <div>
                    <div className="font-semibold text-gray-400 mb-2">Suggested Tags</div>
                    <div className="flex flex-wrap gap-1">
                      {result.analysis.suggestedPlaybookTags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded bg-blue-900/30 text-blue-200 border border-blue-800 text-[10px]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <details className="mt-2 group">
                  <summary className="cursor-pointer font-semibold text-gray-500 hover:text-gray-300 text-[10px]">
                    Raw Model Output (Debug)
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap text-[9px] font-mono bg-black/40 text-gray-400 p-2 rounded max-h-48 overflow-auto border border-gray-800">
                    {result.rawText}
                  </pre>
                </details>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChartVisionAgentPanel;

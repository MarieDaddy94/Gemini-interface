import React, { useState, ChangeEvent, FormEvent, useEffect } from 'react';
import { analyzeChartImageApi } from '../services/visionApi';
import { useVisionSettings } from '../context/VisionSettingsContext';
import { useVision } from '../context/VisionContext';
import MultiTimeframeVisionPanel from './MultiTimeframeVisionPanel';
import LiveWatchPanel from './LiveWatchPanel';
import { VisionSnapshot } from '../types';

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
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
};

const ChartVisionAgentPanel: React.FC = () => {
  const { settings } = useVisionSettings();
  const { setLatestVisionResult, setVisionSummary, recentSnapshots, refreshRecentSnapshots } = useVision();

  const [activeMode, setActiveMode] = useState<'single' | 'mtf' | 'live'>('single');

  const [symbol, setSymbol] = useState('US30');
  const [timeframe, setTimeframe] = useState('1m');
  const [question, setQuestion] = useState(
    'Identify market structure, key levels, and any playbook setups.',
  );

  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentSnapshot, setCurrentSnapshot] = useState<VisionSnapshot | null>(null);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setError(null);
      const base64 = await fileToBase64(file);
      setImageBase64(base64);
      setMimeType(file.type);
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

    setIsLoading(true);
    setError(null);
    setCurrentSnapshot(null);

    try {
      const res = await analyzeChartImageApi({
          fileBase64: imageBase64,
          mimeType: mimeType || 'image/jpeg',
          symbol,
          timeframe,
          question,
          provider: settings.provider === 'auto' ? 'gemini' : settings.provider,
          source: 'manual'
      });

      setCurrentSnapshot(res.snapshot);
      
      // Update global context
      setLatestVisionResult({
          snapshot: res.snapshot,
          summary: res.visionSummary,
          rawText: JSON.stringify(res.snapshot)
      });
      setVisionSummary(res.visionSummary);
      
      // Refresh list
      await refreshRecentSnapshots(symbol === 'US30' ? undefined : symbol);

    } catch (err: any) {
      console.error(err);
      setError(err.message ?? 'Error running chart vision.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#050509] text-gray-100 overflow-hidden">
      {/* Sub-Navigation Tabs */}
      <div className="flex border-b border-gray-800 bg-[#101018] shrink-0">
        <button
          onClick={() => setActiveMode('single')}
          className={`flex-1 py-2 text-[11px] font-semibold transition-colors border-b-2 ${
            activeMode === 'single'
              ? 'border-[#2962ff] text-[#2962ff] bg-[#161a25]'
              : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-[#161a25]/50'
          }`}
        >
          Single Chart
        </button>
        <button
          onClick={() => setActiveMode('mtf')}
          className={`flex-1 py-2 text-[11px] font-semibold transition-colors border-b-2 ${
            activeMode === 'mtf'
              ? 'border-[#2962ff] text-[#2962ff] bg-[#161a25]'
              : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-[#161a25]/50'
          }`}
        >
          MTF Vision
        </button>
        <button
          onClick={() => setActiveMode('live')}
          className={`flex-1 py-2 text-[11px] font-semibold transition-colors border-b-2 ${
            activeMode === 'live'
              ? 'border-[#2962ff] text-[#2962ff] bg-[#161a25]'
              : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-[#161a25]/50'
          }`}
        >
          Live Watch
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden relative p-2">
        {/* Render Single Chart Mode (Inline) */}
        {activeMode === 'single' && (
          <div className="flex flex-col gap-4 h-full">
            <div className="flex items-center justify-between border-b border-gray-800 pb-2 shrink-0">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300">Chart Vision</h2>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  Analyze chart structure, liquidity, and playbook setups.
                </p>
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
                  <label className="block text-[10px] font-medium text-gray-400 mb-1">Instructions (Optional)</label>
                  <textarea
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    rows={3}
                    className="w-full bg-[#101018] border border-gray-700 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-[#2962ff]"
                    placeholder="Specific context..."
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="mt-1 w-full flex items-center justify-center px-3 py-2 text-xs font-bold uppercase tracking-wide rounded bg-[#2962ff] hover:bg-[#1e53e5] text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-blue-500/20"
                >
                  {isLoading ? 'Analyzing...' : 'Analyze Chart'}
                </button>

                {error && <p className="text-[10px] text-red-400 mt-1 bg-red-500/10 p-2 rounded border border-red-500/20">{error}</p>}
                
                {/* Recent History Mini-Gallery */}
                <div className="mt-4 border-t border-gray-800 pt-2">
                    <h3 className="text-[10px] font-bold text-gray-500 uppercase mb-2">Recent Snapshots</h3>
                    <div className="space-y-2">
                        {recentSnapshots.slice(0, 3).map(snap => (
                            <div key={snap.id} className="bg-[#101018] p-2 rounded border border-gray-800 text-[10px]">
                                <div className="flex justify-between text-gray-400 mb-1">
                                    <span>{snap.symbol} ({snap.timeframe})</span>
                                    <span>{new Date(snap.createdAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                </div>
                                <div className="text-gray-300 line-clamp-2">{snap.textSummary}</div>
                                <div className="mt-1 flex gap-1 flex-wrap">
                                    <span className={`px-1 rounded text-[9px] ${snap.bias === 'bullish' ? 'text-green-400 bg-green-900/20' : snap.bias === 'bearish' ? 'text-red-400 bg-red-900/20' : 'text-gray-400 bg-gray-800'}`}>
                                        {snap.bias.toUpperCase()}
                                    </span>
                                    {snap.structureTags?.slice(0,2).map((t, i) => (
                                        <span key={i} className="px-1 rounded text-[9px] text-blue-300 bg-blue-900/20 border border-blue-900/40">{t}</span>
                                    ))}
                                </div>
                            </div>
                        ))}
                        {recentSnapshots.length === 0 && <div className="text-gray-600 italic">No recent history.</div>}
                    </div>
                </div>
              </form>

              {/* Right: Output */}
              <div className="md:w-2/3 flex flex-col border border-gray-800 rounded bg-[#101018] overflow-hidden">
                <div className="px-3 py-2 border-b border-gray-800 bg-[#161a25]">
                   <h3 className="text-xs font-semibold text-gray-300">Analysis Result</h3>
                </div>
                
                <div className="flex-1 overflow-auto p-3 text-[11px] text-gray-300">
                  {!currentSnapshot && !isLoading && (
                    <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-50">
                      <p>Upload & Analyze to see structured vision results.</p>
                    </div>
                  )}

                  {isLoading && (
                     <div className="h-full flex flex-col items-center justify-center text-gray-400">
                        <div className="w-6 h-6 border-2 border-[#2962ff] border-t-transparent rounded-full animate-spin mb-2"></div>
                        <p>Reading chart structure...</p>
                     </div>
                  )}

                  {currentSnapshot && (
                    <div className="flex flex-col gap-4">
                      {/* Top Summary Box */}
                      <div className="p-3 bg-[#1e222d] border border-gray-700 rounded shadow-sm">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Executive Summary</div>
                        <p className="text-gray-100 leading-relaxed text-sm">{currentSnapshot.textSummary}</p>
                      </div>

                      {/* Bias & Stats Grid */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="p-2 bg-[#161a25] border border-gray-700 rounded text-center">
                          <div className="text-[9px] uppercase text-gray-500 mb-1">Bias</div>
                          <div className={`text-base font-bold uppercase ${currentSnapshot.bias === 'bullish' ? 'text-green-400' : currentSnapshot.bias === 'bearish' ? 'text-red-400' : 'text-yellow-400'}`}>
                            {currentSnapshot.bias}
                          </div>
                        </div>
                        <div className="p-2 bg-[#161a25] border border-gray-700 rounded text-center">
                          <div className="text-[9px] uppercase text-gray-500 mb-1">Regime</div>
                          <div className="text-base font-bold text-white capitalize">
                            {currentSnapshot.regime}
                          </div>
                        </div>
                        <div className="p-2 bg-[#161a25] border border-gray-700 rounded text-center">
                          <div className="text-[9px] uppercase text-gray-500 mb-1">Volatility</div>
                          <div className={`text-base font-bold uppercase ${currentSnapshot.volatility === 'high' ? 'text-orange-400' : 'text-blue-300'}`}>
                            {currentSnapshot.volatility}
                          </div>
                        </div>
                      </div>

                      {/* Tags */}
                      {currentSnapshot.structureTags && currentSnapshot.structureTags.length > 0 && (
                        <div>
                           <div className="text-[10px] font-bold text-gray-500 uppercase mb-2">Structure Tags</div>
                           <div className="flex flex-wrap gap-2">
                              {currentSnapshot.structureTags.map((tag, idx) => (
                                 <span key={idx} className="px-2 py-1 rounded bg-blue-900/30 text-blue-200 border border-blue-700/50 text-xs">
                                    {tag}
                                 </span>
                              ))}
                           </div>
                        </div>
                      )}

                      {/* Levels */}
                      {currentSnapshot.levels && currentSnapshot.levels.length > 0 && (
                        <div className="bg-[#161a25] p-3 rounded border border-gray-700">
                           <div className="text-[10px] font-bold text-gray-500 uppercase mb-2">Key Levels</div>
                           <div className="space-y-1">
                              {currentSnapshot.levels.map((lvl, idx) => (
                                 <div key={idx} className="flex justify-between items-center text-xs border-b border-gray-800 last:border-0 pb-1">
                                    <span className="font-mono text-white">{lvl.price}</span>
                                    <div className="flex gap-2">
                                       <span className={`uppercase font-bold ${lvl.type === 'liquidity' ? 'text-purple-400' : 'text-gray-400'}`}>{lvl.type}</span>
                                       <span className="text-gray-600 italic">({lvl.strength})</span>
                                    </div>
                                 </div>
                              ))}
                           </div>
                        </div>
                      )}

                      {/* Playbook Hints */}
                      {currentSnapshot.playbookHints && currentSnapshot.playbookHints.length > 0 && (
                        <div>
                           <div className="text-[10px] font-bold text-gray-500 uppercase mb-2">Playbook Matches</div>
                           <div className="grid grid-cols-1 gap-2">
                              {currentSnapshot.playbookHints.map((pb, idx) => (
                                 <div key={idx} className="flex items-center justify-between p-2 bg-[#1e222d] border border-gray-700 rounded">
                                    <span className="font-semibold text-gray-200">{pb.playbook}</span>
                                    <div className="flex items-center gap-2">
                                       <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                          <div className={`h-full ${pb.matchScore > 0.7 ? 'bg-green-500' : 'bg-yellow-500'}`} style={{ width: `${pb.matchScore * 100}%` }}></div>
                                       </div>
                                       <span className="text-gray-400 text-[10px] font-mono">{(pb.matchScore * 100).toFixed(0)}%</span>
                                    </div>
                                 </div>
                              ))}
                           </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Render MTF Mode */}
        {activeMode === 'mtf' && <MultiTimeframeVisionPanel />}

        {/* Render Live Watch Mode */}
        {activeMode === 'live' && <LiveWatchPanel />}
      </div>
    </div>
  );
};

export default ChartVisionAgentPanel;
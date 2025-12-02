
import React, { useState, ChangeEvent, FormEvent } from 'react';
import { useVisionSettings } from '../context/VisionSettingsContext';
import { useJournalVisionAgent } from '../services/journalVisionService';
import { JournalVisionResult } from '../types';

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

const JournalVisionPanel: React.FC = () => {
  const { selectedProvider, selectedVisionModelId } = useVisionSettings();
  const { analyzeJournalScreenshot } = useJournalVisionAgent();

  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [contextNote, setContextNote] = useState(
    'Focus on what this performance is saying about my strengths, weaknesses, and behavior.',
  );

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<JournalVisionResult | null>(null);

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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!imageBase64) {
      setError('Upload a performance / history screenshot first.');
      return;
    }
    if (!selectedProvider || !selectedVisionModelId) {
      setError('Select a vision provider/model in Vision Settings first.');
      return;
    }

    setIsLoading(true);
    try {
      const vr = await analyzeJournalScreenshot({
        imageBase64,
        contextNote,
      });
      setResult(vr);
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? 'Error running journal vision.');
    } finally {
      setIsLoading(false);
    }
  };

  const analysis = result?.analysis;

  return (
    <div className="flex flex-col gap-4 h-full bg-[#050509] border-l border-gray-800 text-gray-300 p-2">
      <div className="flex items-center justify-between border-b border-gray-800 pb-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide">Journal Vision Coach</h2>
          <p className="text-[10px] text-gray-500">
            Drop in a broker history or performance screenshot and let the Journaling Coach read it
            and talk to you about your stats and behavior.
          </p>
        </div>
        <div className="text-[10px] text-gray-500 text-right">
          <div>Provider: <span className="font-medium text-gray-300">{selectedProvider ?? '—'}</span></div>
          <div>Model: <span className="font-medium text-gray-300">{selectedVisionModelId ?? '—'}</span></div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-4 flex-1 overflow-hidden min-h-0">
        {/* Left: screenshot + context */}
        <div className="md:w-1/2 flex flex-col gap-3 overflow-y-auto">
          <div>
            <label className="block text-[10px] font-medium mb-1">Performance / history screenshot</label>
            <input type="file" accept="image/*" onChange={handleFileChange} className="text-[10px] file:mr-2 file:py-0.5 file:px-2 file:rounded file:border-0 file:text-[9px] file:bg-gray-800 file:text-gray-300" />
            {imagePreviewUrl && (
              <img
                src={imagePreviewUrl}
                alt="Journal source"
                className="mt-2 max-h-48 rounded border border-gray-700 object-contain"
              />
            )}
          </div>

          <div>
            <label className="block text-[10px] font-medium mb-1">What should the coach focus on?</label>
            <textarea
              value={contextNote}
              onChange={e => setContextNote(e.target.value)}
              rows={3}
              className="w-full bg-[#101018] border border-gray-700 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-[#2962ff] resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="mt-1 inline-flex items-center justify-center px-3 py-2 text-xs font-bold uppercase tracking-wide rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Analyzing…' : 'Analyze screenshot with Journal Vision'}
          </button>

          {error && <p className="text-[10px] text-red-400 mt-1">{error}</p>}
        </div>

        {/* Right: analysis */}
        <div className="md:w-1/2 flex flex-col border border-gray-800 rounded p-3 overflow-hidden bg-[#101018] text-[11px]">
          <h3 className="font-semibold text-gray-200 mb-2 border-b border-gray-700 pb-1">Journal Coach Output</h3>
          {!analysis && !isLoading && (
            <p className="text-gray-500 italic">
              Upload a screenshot and run analysis to see the Journal Coach breakdown.
            </p>
          )}

          {isLoading && (
             <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                <p>Reading performance data...</p>
             </div>
          )}

          {analysis && (
            <div className="flex flex-col gap-3 overflow-y-auto pr-1">
              {result?.summary && (
                <div className="bg-[#1e222d] border border-gray-700 p-2 rounded">
                  <div className="text-[9px] uppercase font-bold text-gray-500 mb-1">Summary</div>
                  <p className="text-gray-200 leading-snug">{result.summary}</p>
                </div>
              )}

              <div className="flex justify-between items-center text-[10px] text-gray-400">
                <span className="font-bold">Source type:</span>
                <span>{analysis.source}</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-[#1e222d] border border-gray-700 p-2 rounded text-center">
                  <div className="text-[9px] uppercase font-bold text-gray-500">Win Rate</div>
                  <div className="text-sm font-bold text-white">
                    {typeof analysis.approxWinRate === 'number'
                      ? `${Math.round(analysis.approxWinRate * 100)}%`
                      : 'n/a'}
                  </div>
                </div>
                <div className="bg-[#1e222d] border border-gray-700 p-2 rounded text-center">
                  <div className="text-[9px] uppercase font-bold text-gray-500">Drawdown</div>
                  <div className="text-sm font-bold text-white">
                    {typeof analysis.approxDrawdown === 'number'
                      ? `${Math.round(analysis.approxDrawdown * 100)}%`
                      : 'n/a'}
                  </div>
                </div>
              </div>

              {(analysis.totalTradesText || analysis.bestDayText || analysis.worstDayText) && (
                 <div className="space-y-1">
                    {analysis.totalTradesText && (
                      <div className="flex justify-between border-b border-gray-800 pb-1">
                        <span className="text-gray-500">Volume</span>
                        <span className="text-gray-300">{analysis.totalTradesText}</span>
                      </div>
                    )}
                    {analysis.bestDayText && (
                      <div className="flex justify-between border-b border-gray-800 pb-1">
                        <span className="text-emerald-500/80">Best Day</span>
                        <span className="text-emerald-300">{analysis.bestDayText}</span>
                      </div>
                    )}
                    {analysis.worstDayText && (
                      <div className="flex justify-between border-b border-gray-800 pb-1">
                        <span className="text-red-500/80">Worst Day</span>
                        <span className="text-red-300">{analysis.worstDayText}</span>
                      </div>
                    )}
                 </div>
              )}

              {analysis.strengths.length > 0 && (
                <div>
                  <div className="font-semibold text-emerald-400 mb-1">Strengths</div>
                  <ul className="list-disc list-inside text-gray-300 space-y-0.5">
                    {analysis.strengths.map((s, idx) => (
                      <li key={idx}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}

              {analysis.weaknesses.length > 0 && (
                <div>
                  <div className="font-semibold text-red-400 mb-1">Weaknesses</div>
                  <ul className="list-disc list-inside text-gray-300 space-y-0.5">
                    {analysis.weaknesses.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {analysis.behaviorPatterns.length > 0 && (
                <div>
                  <div className="font-semibold text-blue-400 mb-1">Patterns</div>
                  <ul className="list-disc list-inside text-gray-300 space-y-0.5">
                    {analysis.behaviorPatterns.map((p, idx) => (
                      <li key={idx}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}

              {analysis.coachingNotes && (
                <div className="bg-blue-900/10 border border-blue-800/30 p-2 rounded">
                  <div className="font-semibold text-blue-300 mb-1">Coach Notes</div>
                  <p className="text-gray-200 leading-relaxed">{analysis.coachingNotes}</p>
                </div>
              )}

              <details className="mt-2 group">
                <summary className="cursor-pointer font-semibold text-gray-500 hover:text-white text-[9px]">
                  Raw Model Output
                </summary>
                <pre className="mt-1 whitespace-pre-wrap text-[9px] bg-black/40 text-gray-400 p-2 rounded max-h-32 overflow-auto font-mono">
{result?.rawText}
                </pre>
              </details>
            </div>
          )}
        </div>
      </form>
    </div>
  );
};

export default JournalVisionPanel;

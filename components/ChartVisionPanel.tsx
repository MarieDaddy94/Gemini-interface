
import React, { useState } from 'react';
import { useTradingSession } from '../context/TradingSessionContext';
import { analyzeChartImageApi } from '../services/visionApi';
import { useVision } from '../context/VisionContext';

const MAX_FILE_SIZE_MB = 5;

const ChartVisionPanel: React.FC = () => {
  const { state, addMessage } = useTradingSession();
  const { visionSummary: lastVisionSummary, setVisionSummary } = useVision();

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [localSummary, setLocalSummary] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendToChat, setSendToChat] = useState(true);

  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    setError(null);
    setLocalSummary(null);

    const f = e.target.files?.[0];
    if (!f) {
      setFile(null);
      setPreviewUrl(null);
      return;
    }

    if (!f.type.startsWith('image/')) {
      setError('Please upload an image file (PNG or JPEG).');
      setFile(null);
      setPreviewUrl(null);
      return;
    }

    const sizeMb = f.size / (1024 * 1024);
    if (sizeMb > MAX_FILE_SIZE_MB) {
      setError(
        `Image is too large (${sizeMb.toFixed(
          1
        )} MB). Max is ${MAX_FILE_SIZE_MB} MB.`
      );
      setFile(null);
      setPreviewUrl(null);
      return;
    }

    setFile(f);
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
  };

  const readFileAsBase64 = (f: File): Promise<{ base64: string; mimeType: string }> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== 'string') {
          return reject(new Error('Unexpected FileReader result.'));
        }
        const match = result.match(/^data:(.+?);base64,(.*)$/);
        if (!match) {
          return reject(new Error('Failed to parse base64 data URL.'));
        }
        const mimeType = match[1];
        const base64 = match[2];
        resolve({ base64, mimeType });
      };
      reader.onerror = () => reject(reader.error || new Error('FileReader error.'));
      reader.readAsDataURL(f);
    });

  const handleAnalyze = async () => {
    setError(null);
    setLocalSummary(null);

    if (!file) {
      setError('Upload a chart screenshot first.');
      return;
    }

    setIsAnalyzing(true);
    try {
      const { base64, mimeType } = await readFileAsBase64(file);

      const resp = await analyzeChartImageApi({
        fileBase64: base64,
        mimeType,
        sessionState: state,
        question: question.trim() || undefined,
      });

      setLocalSummary(resp.visionSummary);
      // Store globally so squad round-table can use it as VISUAL SNAPSHOT
      setVisionSummary(resp.visionSummary);

      if (sendToChat && resp.visionSummary) {
        const instrumentLabel =
          state.instrument.displayName || state.instrument.symbol;
        const tf = state.timeframe.currentTimeframe;

        const contentLines: string[] = [];
        contentLines.push(`Chart Vision Analysis`);
        contentLines.push('');
        contentLines.push(`Instrument: ${instrumentLabel}`);
        contentLines.push(`Timeframe: ${tf}`);
        contentLines.push('');
        if (question.trim()) {
          contentLines.push(`Question: ${question.trim()}`);
          contentLines.push('');
        }
        contentLines.push(resp.visionSummary);

        addMessage({
          agentId: 'pattern-gpt',
          sender: 'agent',
          content: contentLines.join('\n'),
          metadata: {
            via: 'chart-vision',
          },
        });
      }
    } catch (err: any) {
      console.error('Chart vision error:', err);
      setError(err?.message || 'Failed to analyze chart image.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const instrumentLabel =
    state.instrument.displayName || state.instrument.symbol;
  const timeframe = state.timeframe.currentTimeframe;
  const env = state.environment.toUpperCase();

  return (
    <div className="chart-vision-panel flex flex-col h-full bg-[#050509] text-gray-100 border-l border-gray-800">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-800">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Chart Vision (Gemini)
        </div>
        <div className="text-[11px] text-gray-500 mt-1">
          Upload a TradingView / TradeLocker screenshot and let Gemini describe
          structure, liquidity, and concrete trade ideas for {instrumentLabel} [
          {timeframe}] ({env}). The latest analysis is shared with the squad as a
          VISUAL SNAPSHOT.
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3 text-[11px]">
        {/* Upload */}
        <section className="space-y-1">
          <div className="font-semibold text-gray-300">Chart Screenshot</div>
          <input
            type="file"
            accept="image/png,image/jpeg"
            onChange={handleFileChange}
            className="text-[11px]"
          />
          {previewUrl && (
            <div className="mt-2">
              <div className="text-[10px] text-gray-500 mb-1">Preview:</div>
              <img
                src={previewUrl}
                alt="Chart preview"
                className="max-h-40 w-auto border border-gray-700 rounded-md"
              />
            </div>
          )}
        </section>

        {/* Question (optional) */}
        <section className="space-y-1">
          <div className="font-semibold text-gray-300">Optional Question</div>
          <textarea
            className="w-full min-h-[50px] bg-[#101018] border border-gray-700 rounded-md px-2 py-1 text-[11px] resize-y"
            placeholder="Example: 'Tell me if this is a good place to look for a continuation long vs a reversal short, and where the cleanest liquidity grabs are.'"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <div className="flex items-center gap-2 mt-1">
            <button
              type="button"
              className="px-3 py-1 rounded-md bg-pink-600 hover:bg-pink-500 text-[11px] disabled:bg-pink-900 disabled:cursor-not-allowed"
              onClick={handleAnalyze}
              disabled={isAnalyzing}
            >
              {isAnalyzing ? 'Analyzing...' : 'Analyze Chart with Gemini'}
            </button>

            <label className="inline-flex items-center gap-1 text-[11px] text-gray-400">
              <input
                type="checkbox"
                className="h-3 w-3"
                checked={sendToChat}
                onChange={(e) => setSendToChat(e.target.checked)}
              />
              <span>Send result to Chat as Pattern GPT</span>
            </label>
          </div>
          {error && (
            <div className="mt-1 text-[11px] text-red-400">{error}</div>
          )}
        </section>

        {/* Latest summary */}
        {(localSummary || lastVisionSummary) && (
          <section className="space-y-1">
            <div className="font-semibold text-gray-300">
              Latest Gemini Vision Summary
            </div>
            <div className="border border-gray-700 rounded-md p-2 bg-[#101018] whitespace-pre-wrap text-[11px] text-gray-200">
              {localSummary || lastVisionSummary}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default ChartVisionPanel;


import React, { useState } from 'react';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { VisionResult, ChartVisionAnalysis, JournalVisionAnalysis } from '../types';

interface VoiceVisionConsoleProps {
  lastChartVision?: VisionResult | null;
  lastMtfVisionAnalysis?: ChartVisionAnalysis | null;
  lastJournalVision?: JournalVisionAnalysis | null;
  onSubmitVoiceSession: (params: {
    transcript: string;
    chartVision?: VisionResult | null;
    mtfAnalysis?: ChartVisionAnalysis | null;
    journalInsights?: JournalVisionAnalysis | null;
  }) => void;
}

const VoiceVisionConsole: React.FC<VoiceVisionConsoleProps> = ({
  lastChartVision,
  lastMtfVisionAnalysis,
  lastJournalVision,
  onSubmitVoiceSession,
}) => {
  const {
    isSupported,
    isRecording,
    transcript,
    error,
    start,
    stop,
    reset,
  } = useVoiceInput({ lang: 'en-US', continuous: false });

  const [assistantNotes, setAssistantNotes] = useState(
    'Talk to your AI team about what you see. Example: "Given this US30 1m chart and the last vision read, should we still be looking for longs or stand aside?"',
  );

  const handleSubmit = () => {
    if (!transcript.trim()) return;
    onSubmitVoiceSession({
      transcript: transcript.trim(),
      chartVision: lastChartVision ?? null,
      mtfAnalysis: lastMtfVisionAnalysis ?? null,
      journalInsights: lastJournalVision ?? null,
    });
    reset();
  };

  return (
    <div className="flex flex-col gap-2 border border-gray-700 rounded-md p-3 text-[11px] bg-[#101018]">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold text-blue-300 uppercase tracking-wide">Voice + Vision Console</div>
          <p className="text-[10px] text-gray-500">
            Hold a conversation with your AI desk while it has access to the latest vision reads.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isSupported && (
            <span className="text-[9px] text-red-400">
              Browser speech not supported.
            </span>
          )}
          {isSupported && (
            <button
              type="button"
              onClick={isRecording ? stop : start}
              className={`inline-flex items-center justify-center px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wide transition-colors ${
                isRecording ? 'bg-red-600 text-white animate-pulse' : 'bg-gray-700 hover:bg-gray-600 text-white'
              }`}
            >
              {isRecording ? 'Stop Mic' : 'Start Mic'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="text-[10px] text-red-400 bg-red-900/10 p-1 rounded">
          Speech error: {error}
        </p>
      )}

      <div>
        <div className="flex justify-between items-end mb-1">
           <label className="block text-[10px] font-medium text-gray-400">Transcript</label>
           {isRecording && <span className="text-[9px] text-green-400 animate-pulse">● Recording...</span>}
        </div>
        <textarea
          value={transcript}
          onChange={e => {
            // allow manual edits to the transcript too
            // so you can tweak it before sending
            (e as any).persist?.();
            // direct update handled by hook internally usually, 
            // but here we display hook state. We rely on hook reset.
          }}
          readOnly
          rows={2}
          className="w-full border border-gray-700 rounded px-2 py-1 text-[11px] bg-black/40 text-gray-200 focus:outline-none resize-none"
          placeholder={
            isSupported
              ? 'Press "Start Mic" and speak...'
              : 'Browser speech recognition not available.'
          }
        />
      </div>

      <div className="flex flex-wrap gap-2 text-[9px] text-gray-500 bg-[#080810] p-1.5 rounded border border-gray-800">
        <span className={lastChartVision ? 'text-green-400' : 'text-gray-600'}>
          ● Chart Vision {lastChartVision ? '(Ready)' : '(None)'}
        </span>
        <span className={lastMtfVisionAnalysis ? 'text-green-400' : 'text-gray-600'}>
          ● MTF Vision {lastMtfVisionAnalysis ? '(Ready)' : '(None)'}
        </span>
        <span className={lastJournalVision ? 'text-green-400' : 'text-gray-600'}>
          ● Journal Vision {lastJournalVision ? '(Ready)' : '(None)'}
        </span>
      </div>

      <button
        type="button"
        disabled={!transcript.trim()}
        onClick={handleSubmit}
        className="mt-1 inline-flex items-center justify-center px-3 py-2 text-[10px] font-bold uppercase tracking-wide rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors"
      >
        Send to AI Desk (Voice + Vision Context)
      </button>
    </div>
  );
};

export default VoiceVisionConsole;

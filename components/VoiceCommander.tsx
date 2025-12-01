
import React, { useRef, useState } from 'react';
import { useTradingSession } from '../context/TradingSessionContext';
import { useAutopilotJournal } from '../context/AutopilotJournalContext';
import { parseVoiceAutopilotCommandApi } from '../services/voiceAutopilotApi';
import {
  planAutopilotTrade as planAutopilotTradeApi,
} from '../services/autopilotApi';

const VoiceCommander: React.FC = () => {
  const { state, addMessage } = useTradingSession();
  const { addEntry } = useAutopilotJournal();

  const [supported] = useState(
    typeof window !== 'undefined' &&
      (('SpeechRecognition' in window) ||
        ('webkitSpeechRecognition' in window))
  );
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const recognitionRef = useRef<any>(null);

  const startListening = () => {
    if (!supported || isListening) return;
    setError(null);
    setStatus('Listening...');
    setTranscript('');

    const AnyWin = window as any;
    const SpeechRecognition =
      AnyWin.SpeechRecognition || AnyWin.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError('Speech recognition not available in this browser.');
      return;
    }

    const recog = new SpeechRecognition();
    recog.lang = 'en-US';
    recog.continuous = false;
    recog.interimResults = false;

    recog.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      setTranscript(text);
      setStatus('Captured voice command.');
      setIsListening(false);
    };

    recog.onerror = (event: any) => {
      console.error('Speech recognition error:', event);
      setError('Speech recognition error.');
      setIsListening(false);
      setStatus(null);
    };

    recog.onend = () => {
      setIsListening(false);
      if (!transcript) {
        setStatus('Stopped listening.');
      }
    };

    recognitionRef.current = recog;
    setIsListening(true);
    recog.start();
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  };

  const handleRunVoiceAutopilot = async () => {
    setError(null);
    setStatus(null);

    const t = transcript.trim();
    if (!t) {
      setError('No transcript captured. Speak a command first.');
      return;
    }

    setIsProcessing(true);
    try {
      // 1) Parse the voice command
      const parsed = await parseVoiceAutopilotCommandApi({
        transcript: t,
        sessionState: state,
      });

      setStatus(
        `Parsed: ${parsed.direction.toUpperCase()} @ ${parsed.riskPercent.toFixed(
          2
        )}% (${parsed.executeMode})`
      );

      if (parsed.direction === 'flat') {
        // Just a question, send to chat and stop
        addMessage({
          agentId: 'strategist-main',
          sender: 'user',
          content: t,
          metadata: { via: 'voice' },
        });
        addMessage({
          agentId: 'strategist-main',
          sender: 'agent',
          content:
            'Voice command parsed as a question without a clear trade bias. Use the squad round-table or chat to discuss.',
          metadata: { via: 'voice' },
        });
        setIsProcessing(false);
        return;
      }

      // 2) Ask Autopilot planner for a plan
      const plan = await planAutopilotTradeApi(state, {
        direction: parsed.direction,
        riskPercent: parsed.riskPercent,
        notes: parsed.notes || `Voice command: "${t}"`,
      });

      const instrumentLabel =
        state.instrument.displayName || state.instrument.symbol;

      // 3) Log in Autopilot journal
      addEntry({
        instrumentSymbol: instrumentLabel,
        direction: parsed.direction,
        riskPercent: parsed.riskPercent,
        environment: state.environment,
        autopilotMode: state.autopilotMode,
        planSummary: plan.planSummary,
        allowed: plan.allowed,
        recommended: plan.recommended,
        riskReasons: plan.riskReasons,
        riskWarnings: plan.riskWarnings,
        source: 'voice',
        executionStatus: 'not_executed',
      });

      // 4) Send detailed summary into chat as Execution Bot
      const lines: string[] = [];
      lines.push('Voice Autopilot Plan');
      lines.push('');
      lines.push(`Transcript: "${t}"`);
      lines.push(
        `Parsed: ${parsed.direction.toUpperCase()} @ ${parsed.riskPercent.toFixed(
          2
        )}% (mode: ${parsed.executeMode})`
      );
      lines.push('');
      lines.push(`Instrument: ${instrumentLabel}`);
      lines.push(
        `Environment: ${state.environment.toUpperCase()} | Autopilot: ${state.autopilotMode.toUpperCase()}`
      );
      lines.push('');
      lines.push(
        `Risk verdict: ${plan.allowed ? 'ALLOWED' : 'BLOCKED'} | Execution Bot: ${
          plan.recommended ? 'RECOMMENDS' : 'DOES NOT RECOMMEND'
        }`
      );
      lines.push('');
      lines.push('Plan summary:');
      lines.push(plan.planSummary);
      lines.push('');

      if (plan.riskReasons && plan.riskReasons.length > 0) {
        lines.push('Hard risk blocks:');
        plan.riskReasons.forEach((r: string, idx: number) =>
          lines.push(`  ${idx + 1}. ${r}`)
        );
        lines.push('');
      }
      if (plan.riskWarnings && plan.riskWarnings.length > 0) {
        lines.push('Risk warnings:');
        plan.riskWarnings.forEach((w: string, idx: number) =>
          lines.push(`  ${idx + 1}. ${w}`)
        );
        lines.push('');
      }

      addMessage({
        agentId: 'execution-bot',
        sender: 'agent',
        content: lines.join('\n'),
        metadata: {
          via: 'voice-autopilot',
        },
      });

      setStatus('Voice Autopilot plan generated. Check Autopilot & Journal.');
    } catch (err: any) {
      console.error('Voice Autopilot error:', err);
      setError(err?.message || 'Voice Autopilot failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!supported) {
    return (
      <div className="voice-commander px-3 py-2 text-[11px] text-gray-500">
        Voice commands not supported in this browser.
      </div>
    );
  }

  return (
    <div className="voice-commander flex flex-col bg-[#050509] text-gray-100 border-l border-gray-800">
      <div className="px-3 py-2 border-b border-gray-800">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Voice Commander
        </div>
        <div className="text-[11px] text-gray-500 mt-1">
          Speak commands like "Plan a 0.5% long on US30". The system parses it,
          runs Autopilot, and logs the plan.
        </div>
      </div>

      <div className="px-3 py-2 space-y-2 text-[11px]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`px-3 py-1 rounded-md ${
              isListening ? 'bg-red-600' : 'bg-green-600'
            } hover:opacity-90 text-[11px]`}
            onClick={isListening ? stopListening : startListening}
          >
            {isListening ? 'Stop Listening' : 'Start Listening'}
          </button>

          <button
            type="button"
            className="px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-[11px] disabled:bg-emerald-900 disabled:cursor-not-allowed"
            onClick={handleRunVoiceAutopilot}
            disabled={isProcessing || !transcript.trim()}
          >
            {isProcessing ? 'Processing...' : 'Run Voice Autopilot'}
          </button>
        </div>

        {status && (
          <div className="text-[11px] text-gray-400">
            {status}
          </div>
        )}
        {error && (
          <div className="text-[11px] text-red-400">
            {error}
          </div>
        )}

        {transcript && (
          <div className="mt-1">
            <div className="font-semibold text-gray-300">
              Last Transcript
            </div>
            <div className="border border-gray-700 rounded-md p-2 bg-[#101018] text-gray-200">
              {transcript}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VoiceCommander;

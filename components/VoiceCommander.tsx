
import React, { useEffect, useRef, useState } from 'react';
import { useTradingSession } from '../context/TradingSessionContext';
import { useAutopilotJournal } from '../context/AutopilotJournalContext';
import {
  AgentMessage,
  TradeDirection,
} from '../types';
import { callAgentRouter } from '../services/agentApi';
import { planAutopilotTrade } from '../services/autopilotApi';

declare global {
  interface Window {
    webkitSpeechRecognition?: any;
    SpeechRecognition?: any;
  }
}

const VoiceCommander: React.FC = () => {
  const { state, addMessage } = useTradingSession();
  const { addEntry } = useAutopilotJournal();

  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [lastTranscript, setLastTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SR =
      window.SpeechRecognition || window.webkitSpeechRecognition || null;
    if (SR) {
      setIsSupported(true);
      const rec = new SR();
      rec.lang = 'en-US';
      rec.continuous = false;
      rec.interimResults = true;

      rec.onresult = (e: any) => {
        let final = '';
        for (let i = 0; i < e.results.length; i++) {
          const res = e.results[i];
          final += res[0].transcript;
        }
        setLastTranscript(final.trim());
      };

      rec.onerror = (e: any) => {
        console.error('Speech recognition error:', e);
        setError(e?.error || 'Speech recognition error');
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
        if (lastTranscript.trim()) {
          void handleTranscript(lastTranscript.trim());
        }
      };

      recognitionRef.current = rec;
    } else {
      setIsSupported(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleListening = () => {
    if (!isSupported) return;
    const rec = recognitionRef.current;
    if (!rec) return;

    setError(null);

    if (!isListening) {
      setLastTranscript('');
      setIsListening(true);
      rec.start();
    } else {
      setIsListening(false);
      rec.stop();
    }
  };

  const parseDirection = (text: string): TradeDirection => {
    const lower = text.toLowerCase();
    if (lower.includes('short') || lower.includes('sell')) return 'short';
    return 'long';
  };

  const parseRiskPercent = (text: string, fallback: number): number => {
    const lower = text.toLowerCase();
    const match = lower.match(/(\d+(\.\d+)?)\s*%?/);
    if (match) {
      const value = parseFloat(match[1]);
      if (!isNaN(value) && value > 0 && value < 100) return value;
    }
    return fallback;
  };

  const handleTranscript = async (transcript: string) => {
    if (!transcript) return;
    setBusy(true);
    setError(null);

    try {
      // 1) Send the voice text into chat as a user message
      const userMsgBase: Omit<AgentMessage, 'id' | 'createdAt'> = {
        agentId: undefined,
        sender: 'user',
        content: `(voice) ${transcript}`,
        metadata: {
          via: 'voice',
        },
      };
      addMessage(userMsgBase);

      const lower = transcript.toLowerCase();
      const isAutopilotIntent =
        lower.includes('autopilot') || lower.includes('plan');

      // 2a) Normal agent chat (Strategist) for general questions
      if (!isAutopilotIntent) {
        const historyForApi: AgentMessage[] = [
          ...state.messages,
          {
            id: `temp_voice_${Date.now()}`,
            createdAt: new Date().toISOString(),
            ...userMsgBase,
          },
        ];

        const result = await callAgentRouter({
          agentId: 'strategist-main',
          userMessage: transcript,
          sessionState: state,
          history: historyForApi,
        });

        addMessage({
          agentId: result.agentId,
          sender: 'agent',
          content: result.content,
          metadata: {
            via: 'voice-agent',
          },
        });
        return;
      }

      // 2b) Autopilot intent => call Autopilot Execution Planner
      const direction = parseDirection(transcript);
      const fallbackRisk = state.riskConfig.maxRiskPerTradePercent;
      const riskPercent = parseRiskPercent(transcript, fallbackRisk);

      const plan = await planAutopilotTrade(state, {
        direction,
        riskPercent,
        notes: `(voice) ${transcript}`,
      });

      // Log to journal
      addEntry({
        instrumentSymbol:
          state.instrument.symbol || state.instrument.displayName,
        direction,
        riskPercent,
        environment: state.environment,
        autopilotMode: state.autopilotMode,
        planSummary: plan.planSummary,
        allowed: plan.allowed,
        recommended: plan.recommended,
        riskReasons: plan.riskReasons || [],
        riskWarnings: plan.riskWarnings || [],
        source: 'voice',
        executionStatus: 'not_executed',
      });

      // Push into chat as Execution Bot
      let content = `Voice Autopilot Plan\n\n`;
      content += `Heard: "${transcript}"\n\n`;
      content += `Direction: ${direction.toUpperCase()}\n`;
      content += `Risk: ${riskPercent.toFixed(2)}% of equity\n`;
      content += `Allowed by risk engine: ${plan.allowed ? 'YES' : 'NO'}\n`;
      content += `Recommended by Execution Bot: ${
        plan.recommended ? 'YES' : 'NO'
      }\n\n`;
      content += `Plan summary:\n${plan.planSummary}\n\n`;

      if (plan.riskReasons && plan.riskReasons.length > 0) {
        content += `Hard risk blocks:\n`;
        plan.riskReasons.forEach((r, idx) => {
          content += `  ${idx + 1}. ${r}\n`;
        });
        content += `\n`;
      }
      if (plan.riskWarnings && plan.riskWarnings.length > 0) {
        content += `Risk warnings:\n`;
        plan.riskWarnings.forEach((w, idx) => {
          content += `  ${idx + 1}. ${w}\n`;
        });
        content += `\n`;
      }

      addMessage({
        agentId: 'execution-bot',
        sender: 'agent',
        content,
        metadata: {
          via: 'voice-autopilot',
        },
      });
    } catch (err: any) {
      console.error('Voice command error:', err);
      setError(err?.message || 'Voice command handling failed.');
    } finally {
      setBusy(false);
    }
  };

  if (!isSupported) {
    return (
      <div className="voice-commander text-[11px] text-gray-500 px-3 py-2 border-t border-gray-800">
        Browser voice recognition not supported. (Use Chrome desktop or similar.)
      </div>
    );
  }

  return (
    <div className="voice-commander px-3 py-2 border-t border-gray-800 text-[11px] bg-[#050509] text-gray-200">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="font-semibold text-gray-300">
            Voice Commander
          </span>
          <span className="text-[10px] text-gray-500">
            Tap to talk. Say things like:
            {' '}
            <span className="italic">
              "Autopilot plan a 0.5 percent long on US30"
            </span>
            .
          </span>
        </div>
        <button
          type="button"
          className={`px-3 py-1 rounded-full text-[11px] ${
            isListening
              ? 'bg-red-600 hover:bg-red-500'
              : 'bg-green-600 hover:bg-green-500'
          } disabled:bg-gray-700 disabled:cursor-not-allowed`}
          onClick={toggleListening}
          disabled={busy}
        >
          {isListening ? 'Stop' : 'Talk'}
        </button>
      </div>

      {lastTranscript && (
        <div className="mt-1 text-[10px] text-gray-400">
          Last: <span className="italic">"{lastTranscript}"</span>
        </div>
      )}

      {error && (
        <div className="mt-1 text-[10px] text-red-400">
          {error}
        </div>
      )}
    </div>
  );
};

export default VoiceCommander;

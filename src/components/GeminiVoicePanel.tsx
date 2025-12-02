
import React, { useEffect, useRef, useState } from "react";
import {
  GeminiLiveClient,
  GeminiLiveToolCall,
  GeminiLiveToolResponse,
} from "../services/GeminiLiveClient";
import { useTradingContextForAI } from "../hooks/useTradingContextForAI";
import { useRealtimeConfig } from "../context/RealtimeConfigContext";
import { apiClient } from "../utils/apiClient";

const GEMINI_TARGET_SAMPLE_RATE = 16000;

const GeminiVoicePanel: React.FC = () => {
  const clientRef = useRef<GeminiLiveClient | null>(null);

  const [log, setLog] = useState<string[]>([]);
  const [userInput, setUserInput] = useState("");
  const [connected, setConnected] = useState(false);

  const [micActive, setMicActive] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const { journalInsights } = useTradingContextForAI();
  const journalRef = useRef(journalInsights);
  useEffect(() => { journalRef.current = journalInsights; }, [journalInsights]);

  const { getVoiceProfile } = useRealtimeConfig();
  const voiceProfile = getVoiceProfile("strategist");

  const [apiKey, setApiKey] = useState("");
  useEffect(() => {
    const stored = localStorage.getItem("gemini_api_key");
    if(stored) setApiKey(stored);
  }, []);

  const pushLog = (line: string) => {
    setLog((prev) => [...prev, line].slice(-300));
  };

  useEffect(() => {
    const client = new GeminiLiveClient({
      apiKey: apiKey, 
      voiceName: voiceProfile.geminiPreset ?? "Aoede",
      onSetupComplete: () => {
        pushLog("✅ Gemini Live setup complete");
        setConnected(true);
      },
      onServerText: (text, isFinal) => {
        pushLog(`AI: ${text}${isFinal ? " (final)" : ""}`);
      },
      onError: (err) => {
        console.error("Gemini Live error", err);
        pushLog(`⚠️ Error: ${String((err as any)?.message ?? err)}`);
        setConnected(false);
      },
      onToolCall: async (calls: GeminiLiveToolCall[]) => {
        const responses: GeminiLiveToolResponse[] = [];

        for (const call of calls) {
          const name = call.name;
          pushLog(`🛠 ToolCall → ${name}`);

          try {
            if (name === "get_chart_playbook") {
               const params = new URLSearchParams();
               if (call.args.symbol) params.set("symbol", String(call.args.symbol));
               if (call.args.timeframe) params.set("timeframe", String(call.args.timeframe));
               if (call.args.direction) params.set("direction", String(call.args.direction));
               
               const json = await apiClient.get<any>(`/api/tools/playbooks?${params.toString()}`);
               responses.push({ id: call.id, name, result: json });

            } else if (name === "log_trade_journal") {
               const json = await apiClient.post<any>('/api/tools/journal-entry', call.args);
               responses.push({ id: call.id, name, result: json });

            } else if (name === "get_trading_context") {
              const json = await apiClient.get<{ snapshot: any }>('/api/broker/snapshot');
              
              const result = {
                 brokerSnapshot: json.snapshot,
                 journalInsights: journalRef.current,
                 scope: call.args.scope
              };
              responses.push({ id: call.id, name, result });

            } else if (name === "run_autopilot_review") {
              const { symbol, side, entry, stopLoss, takeProfit, riskPct, reasoningSummary } = call.args as any;
              
              const snapJson = await apiClient.get<{ snapshot: any }>('/api/broker/snapshot');

              const reviewPayload = {
                 brokerSnapshot: snapJson.snapshot,
                 candidatePlan: {
                    symbol: symbol || "UNKNOWN",
                    direction: String(side).toLowerCase() === "buy" ? "long" : "short",
                    entry: Number(entry),
                    stopLoss: Number(stopLoss),
                    takeProfits: [Number(takeProfit)],
                    riskPct: Number(riskPct),
                    rationale: reasoningSummary || "Voice review request",
                    timeframe: (call.args.timeFrame as string) || "15m"
                 },
                 journalInsights: journalRef.current,
                 riskProfile: 'balanced'
              };

              const json = await apiClient.post<any>('/api/openai/autopilot/review', reviewPayload);
              responses.push({ id: call.id, name, result: json });

            } else if (name === "get_recent_vision_summary") {
              const json = await apiClient.post<any>('/api/gemini/vision/recent-summary', {
                  symbol: call.args.symbol,
                  timeframe: call.args.timeframe,
                  days: call.args.days ?? 3,
              });
              responses.push({ id: call.id, name, result: json });

            } else {
              responses.push({
                id: call.id,
                name,
                result: { error: `Unknown tool: ${name}` },
              });
            }
          } catch (err) {
            console.error(`Tool ${name} error`, err);
            responses.push({
              id: call.id,
              name,
              result: {
                error: `Tool ${name} failed`,
                details: String((err as any)?.message ?? err),
              },
            });
          }
        }

        clientRef.current?.sendToolResponse(responses);
      },
    });

    clientRef.current = client;
    
    return () => {
      stopMic();
      client.close();
      clientRef.current = null;
      setConnected(false);
    };
  }, [apiKey, voiceProfile]);

  const handleConnect = () => {
      pushLog("Connecting...");
      clientRef.current?.connect().catch((err) => {
          console.error(err);
          pushLog(`❌ Failed to connect: ${err.message}`);
      });
  };

  const handleDisconnect = () => {
      clientRef.current?.close();
      stopMic();
      setConnected(false);
      pushLog("Disconnected");
  };

  const handleSend = () => {
    const text = userInput.trim();
    if (!text || !clientRef.current) return;
    pushLog(`You: ${text}`);
    clientRef.current.sendUserText(text, true);
    setUserInput("");
  };

  const startMic = async () => {
    if (micActive) return;
    if (!clientRef.current || !clientRef.current.isConnected) {
      pushLog("⚠️ Gemini Live is not connected yet.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      const audioCtx = new AudioContext({
        sampleRate: GEMINI_TARGET_SAMPLE_RATE,
      });

      await audioCtx.resume();

      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      const silentGain = audioCtx.createGain();
      silentGain.gain.value = 0;

      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioCtx.destination);

      processor.onaudioprocess = (event: AudioProcessingEvent) => {
        if (!clientRef.current || !clientRef.current.isConnected) return;
        const input = event.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
          let s = input[i];
          if (s > 1) s = 1;
          else if (s < -1) s = -1;
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        clientRef.current.sendRealtimeAudio(pcm16);
      };

      audioCtxRef.current = audioCtx;
      processorRef.current = processor;
      streamRef.current = stream;
      setMicActive(true);
      pushLog("🎙️ Mic streaming started");
    } catch (err) {
      console.error("Mic start error", err);
      pushLog(`⚠️ Could not start microphone: ${String((err as any)?.message ?? err)}`);
    }
  };

  const stopMic = () => {
    if (!micActive) return;
    processorRef.current?.disconnect();
    processorRef.current = null;
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setMicActive(false);
    pushLog("⏹️ Mic streaming stopped");
  };

  return (
    <div className="flex flex-col h-full bg-[#161a25] text-xs p-4 rounded border border-[#2a2e39]">
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-700">
        <div className="flex flex-col">
            <span className="font-bold text-sm text-gray-200">Gemini Live Squad</span>
            <span className="text-[10px] text-gray-500">Realtime Audio/Text Stream</span>
        </div>
        <div className="flex items-center gap-2">
          {!connected ? (
              <button 
                onClick={handleConnect}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-[11px] font-bold uppercase transition-colors"
              >
                  Connect
              </button>
          ) : (
              <>
                  <button
                    className={
                      "px-2 py-1 rounded text-[10px] " +
                      (micActive ? "bg-red-600/80 animate-pulse text-white" : "bg-emerald-600/80 text-white")
                    }
                    onClick={micActive ? stopMic : startMic}
                  >
                    {micActive ? "Stop Mic" : "Start Mic"}
                  </button>
                  <button 
                    onClick={handleDisconnect}
                    className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-[10px] uppercase transition-colors"
                  >
                      Disconnect
                  </button>
              </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[#0a0c10] border border-gray-800 rounded p-2 space-y-1 font-mono text-gray-300 min-h-[150px]">
        {log.length === 0 && <span className="text-gray-600 italic">Ready to connect. Try saying "What is my risk status?" once live.</span>}
        {log.map((line, idx) => (
          <div key={idx} className="break-words">{line}</div>
        ))}
      </div>

      <div className="mt-2 flex gap-2">
        <input
          className="flex-1 bg-[#0a0c10] border border-gray-700 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-[#2962ff]"
          placeholder="Type message..."
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          disabled={!connected}
        />
        <button
          className="px-3 py-1.5 rounded bg-[#2962ff] hover:bg-[#1e53e5] text-white text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleSend}
          disabled={!connected}
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default GeminiVoicePanel;

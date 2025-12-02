import React, { useEffect, useRef, useState } from "react";
import {
  GeminiLiveClient,
  GeminiLiveToolCall,
  GeminiLiveToolResponse,
} from "../services/GeminiLiveClient";
import { useTradingContextForAI } from "../hooks/useTradingContextForAI";
import { useRealtimeConfig } from "../context/RealtimeConfigContext";
import { handleGeminiToolCall } from "../services/geminiToolHandlers";

const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000';
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

  // Use Realtime Config to get voice settings
  const { getVoiceProfile } = useRealtimeConfig();
  // Using strategist profile as the main voice for the squad lead in this session
  const voiceProfile = getVoiceProfile("strategist");

  // Optional: Allow manual override of API key from localStorage if needed
  const [apiKey, setApiKey] = useState("");
  useEffect(() => {
    const stored = localStorage.getItem("gemini_api_key");
    if(stored) setApiKey(stored);
  }, []);

  const pushLog = (line: string) => {
    setLog((prev) => [...prev, line].slice(-300));
  };

  // ---- Gemini Live wiring ----------------------------------------------------

  useEffect(() => {
    const client = new GeminiLiveClient({
      apiKey: apiKey, // If empty, client will fetch ephemeral token
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

        // Wrapper to emulate session object for handleGeminiToolCall
        const toolSession = {
          sendToolResponse: (params: any) => {
             // We won't use this callback directly here because we batch responses below
             // But we need it for the shape match if we used it fully standalone.
             // Instead we will await the result and push to responses array.
          }
        };

        for (const call of calls) {
          const name = call.name;
          pushLog(`🛠 ToolCall → ${name}`);

          try {
            // Check for new tools first
            if (name === "get_chart_playbook" || name === "log_trade_journal") {
               // Reuse the dedicated handler logic for backend calls
               // We invoke it via a temporary adapter or direct logic call
               // Since handleGeminiToolCall sends response immediately, we can't use it 1:1 inside this loop easily
               // unless we refactor to return result. Let's just inline the logic or duplicate small fetch code here
               // to stay consistent with existing loop structure.
               
               let url = "";
               if (name === "get_chart_playbook") {
                  const params = new URLSearchParams();
                  if (call.args.symbol) params.set("symbol", String(call.args.symbol));
                  if (call.args.timeframe) params.set("timeframe", String(call.args.timeframe));
                  if (call.args.direction) params.set("direction", String(call.args.direction));
                  url = `${API_BASE_URL}/api/tools/playbooks?${params.toString()}`;
                  const res = await fetch(url);
                  const json = await res.json();
                  responses.push({ id: call.id, name, result: json });
               } else {
                  url = `${API_BASE_URL}/api/tools/journal-entry`;
                  const res = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(call.args),
                  });
                  const json = await res.json();
                  responses.push({ id: call.id, name, result: json });
               }
               continue;
            }

            if (name === "get_trading_context") {
              const res = await fetch(`${API_BASE_URL}/api/broker/snapshot`);
              const json = await res.json();
              
              // Combine with journal stats
              const result = {
                 brokerSnapshot: json.snapshot,
                 journalInsights: journalRef.current,
                 scope: call.args.scope
              };
              responses.push({ id: call.id, name, result });

            } else if (name === "run_autopilot_review") {
              const { symbol, side, entry, stopLoss, takeProfit, riskPct, reasoningSummary } = call.args as any;
              
              // Use broker snapshot for current balance context
              const snapRes = await fetch(`${API_BASE_URL}/api/broker/snapshot`);
              const snapJson = await snapRes.json();

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

              const res = await fetch(`${API_BASE_URL}/api/openai/autopilot/review`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(reviewPayload),
              });
              const json = await res.json();
              responses.push({ id: call.id, name, result: json });

            } else if (name === "get_recent_vision_summary") {
              const res = await fetch(`${API_BASE_URL}/api/gemini/vision/recent-summary`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  symbol: call.args.symbol,
                  timeframe: call.args.timeframe,
                  days: call.args.days ?? 3,
                }),
              });
              const json = await res.json();
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
    
    // Connect automatically on mount if desired, or let user click Connect.
    // Here we wait for user to click "Connect".

    return () => {
      stopMic();
      client.close();
      clientRef.current = null;
      setConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, voiceProfile]); // Re-init if voice profile changes

  // ---- Connection Handlers --------------------------------------------------

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

  // ---- Text send -------------------------------------------------------------

  const handleSend = () => {
    const text = userInput.trim();
    if (!text || !clientRef.current) return;
    pushLog(`You: ${text}`);
    clientRef.current.sendUserText(text, true);
    setUserInput("");
  };

  // ---- Mic streaming ---------------------------------------------------------

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

      // ScriptProcessorNode is deprecated but works everywhere; simple for now.
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);

      const silentGain = audioCtx.createGain();
      silentGain.gain.value = 0;

      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioCtx.destination);

      processor.onaudioprocess = (event: AudioProcessingEvent) => {
        if (!clientRef.current || !clientRef.current.isConnected) return;
        const input = event.inputBuffer.getChannelData(0); // Float32 [-1,1]

        // Convert Float32 -> Int16 PCM
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
      pushLog("🎙️ Mic streaming started (16kHz PCM → Gemini Live)");
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

  // ---- Render ---------------------------------------------------------------

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

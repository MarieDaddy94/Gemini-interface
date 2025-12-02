import React, { useEffect, useRef, useState } from "react";
import { OpenAIRealtimeClient } from "../services/OpenAIRealtimeClient";
import { useRealtimeConfig } from "../context/RealtimeConfigContext";

type Props = {
  wsUrl: string;
};

const OpenAIVoiceAutopilotPanel: React.FC<Props> = ({ wsUrl }) => {
  const { getVoiceProfile } = useRealtimeConfig();
  const strategistProfile = getVoiceProfile("strategist");

  const clientRef = useRef<OpenAIRealtimeClient | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [userInput, setUserInput] = useState("");
  const [connected, setConnected] = useState(false);

  const pushLog = (line: string) => {
    setLog((prev) => [...prev, line].slice(-300));
  };

  useEffect(() => {
    if (!wsUrl) {
      pushLog("⚠️ No OpenAI Realtime WebSocket URL configured.");
      return;
    }

    const voice =
      strategistProfile.openaiVoice && strategistProfile.openaiVoice.length
        ? strategistProfile.openaiVoice
        : "alloy";

    const client = new OpenAIRealtimeClient({
      url: wsUrl,
      voice,
      instructions:
        "You are an AI trading squad (strategist, risk manager, quant, execution bot) " +
        "helping manage a prop-firm style trading account. Always respect risk limits " +
        "and ask for clarification before executing aggressive trades.",
      events: {
        onOpen: () => {
          setConnected(true);
          pushLog("✅ OpenAI Realtime connected");
        },
        onClose: () => {
          setConnected(false);
          pushLog("🔌 OpenAI Realtime disconnected");
        },
        onError: (err) => {
          console.error("OpenAI Realtime error", err);
          pushLog(
            `⚠️ Error: ${String((err as any)?.message ?? err)}`
          );
        },
        onText: (text, isFinal) => {
          if (!text) return;
          pushLog(`OpenAI Squad: ${text}${isFinal ? " (final)" : ""}`);
        },
      },
    });

    clientRef.current = client;
    
    // Auto-connect on mount/config change
    client.connect();

    return () => {
      client.close();
      clientRef.current = null;
      setConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsUrl, strategistProfile.openaiVoice]);

  const handleSend = () => {
    const text = userInput.trim();
    if (!text || !clientRef.current) return;
    pushLog(`You: ${text}`);
    clientRef.current.sendUserText(text);
    setUserInput("");
  };

  return (
    <div className="flex flex-col h-full bg-black/40 text-xs text-slate-200 p-4 rounded border border-white/10">
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-700">
        <div className="flex flex-col">
          <span className="font-bold text-sm text-gray-200">OpenAI Squad</span>
          <span className="text-[10px] text-gray-500">Realtime WebSocket Stream</span>
        </div>
        <div
          className={
            "px-2 py-0.5 rounded text-[10px] font-bold uppercase " +
            (connected ? "bg-emerald-600/70 text-white" : "bg-red-600/70 text-white")
          }
        >
          {connected ? "Online" : "Offline"}
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[#0a0c10] border border-gray-800 rounded p-2 space-y-1 font-mono min-h-[150px]">
        {log.length === 0 && <span className="text-gray-600 italic">Connecting to OpenAI Realtime...</span>}
        {log.map((line, idx) => (
          <div key={idx} className="break-words">{line}</div>
        ))}
      </div>

      <div className="mt-2 flex gap-2">
        <input
          className="flex-1 bg-[#0a0c10] border border-gray-700 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-[#2962ff]"
          placeholder="Talk to your OpenAI trading squad…"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
        />
        <button
          className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors"
          onClick={handleSend}
        >
          Send
        </button>
      </div>

      <p className="mt-2 text-[10px] opacity-50 text-center">
        Audio is streamed via PCM16 to the shared Voice Bus.
      </p>
    </div>
  );
};

export default OpenAIVoiceAutopilotPanel;
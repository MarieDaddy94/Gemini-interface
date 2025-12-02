
import React, { useEffect, useRef, useState } from "react";
import { GeminiLiveClient, GeminiLiveEvent } from "../services/GeminiLiveClient";

const GeminiVoicePanel: React.FC = () => {
  const [connected, setConnected] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [pendingInput, setPendingInput] = useState("");
  const clientRef = useRef<GeminiLiveClient | null>(null);

  useEffect(() => {
    const client = new GeminiLiveClient({
      systemPrompt:
        "You are the Gemini side of Ant's AI trading squad. You help analyze US30/NAS100/XAU, explain confluence between HTF/LTF structure and the user's account risk. Keep answers tight.",
      onEvent(evt: GeminiLiveEvent) {
        if (evt.type === "open") {
          setConnected(true);
          pushLog("✅ Gemini Live connected");
        } else if (evt.type === "close") {
          setConnected(false);
          pushLog(`❌ Closed: ${evt.code} ${evt.reason}`);
        } else if (evt.type === "error") {
          pushLog(`⚠️ Error: ${String(evt.error)}`);
        } else if (evt.type === "text") {
          pushLog(`Gemini: ${evt.text}`);
        } else if (evt.type === "tool_call") {
          // Later: route to your backend tools (get account snapshot, autopilot review, etc.)
          pushLog(`🛠 Tool call: ${evt.toolName} ${JSON.stringify(evt.args)}`);
        }
      },
    });

    clientRef.current = client;
    // Don't auto-connect to save cost/tokens, let user click connect if preferred, 
    // but per prompt instructions we can auto-start or provide a button. 
    // Let's provide a button for better UX inside the panel.
    
    return () => {
      client.close();
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = () => {
      clientRef.current?.connect().catch((err) => {
          console.error(err);
          pushLog(`❌ Failed to connect: ${err.message}`);
      });
  };

  const handleDisconnect = () => {
      clientRef.current?.close();
  };

  const pushLog = (line: string) => {
    setLog((prev) => [...prev, line].slice(-200));
  };

  const handleSend = () => {
    const trimmed = pendingInput.trim();
    if (!trimmed || !clientRef.current) return;
    pushLog(`You: ${trimmed}`);
    clientRef.current.sendText(trimmed);
    setPendingInput("");
  };

  return (
    <div className="flex flex-col h-full bg-[#161a25] border border-[#2a2e39] rounded-lg mt-4 text-xs p-4">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-700">
        <div className="flex flex-col">
            <span className="font-bold text-sm text-gray-200">Gemini Live Squad</span>
            <span className="text-[10px] text-gray-500">Realtime WebSocket Audio/Text</span>
        </div>
        <div className="flex items-center gap-2">
            <div
            className={
                "w-2 h-2 rounded-full " +
                (connected ? "bg-green-500 animate-pulse" : "bg-red-500")
            }
            />
            <span className="text-[10px] uppercase font-mono text-gray-400">{connected ? "LIVE" : "OFFLINE"}</span>
        </div>
      </div>

      <div className="flex gap-2 mb-3">
          {!connected ? (
              <button 
                onClick={handleConnect}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-[11px] font-bold uppercase transition-colors"
              >
                  Connect
              </button>
          ) : (
              <button 
                onClick={handleDisconnect}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded text-[11px] font-bold uppercase transition-colors"
              >
                  Disconnect
              </button>
          )}
      </div>

      {/* Log */}
      <div className="flex-1 overflow-auto bg-[#0a0c10] border border-gray-800 rounded p-2 space-y-1 mb-3 min-h-[150px] font-mono text-gray-300">
        {log.length === 0 && <span className="text-gray-600 italic">Session log empty...</span>}
        {log.map((line, idx) => (
          <div key={idx} className="break-words">{line}</div>
        ))}
      </div>

      {/* Text input for now – audio controls can go beside it later */}
      <div className="flex gap-2">
        <input
          className="flex-1 bg-[#0a0c10] border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#2962ff]"
          placeholder="Talk to Gemini squad…"
          value={pendingInput}
          onChange={(e) => setPendingInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          disabled={!connected}
        />
        <button
          className="px-3 py-1.5 text-xs bg-[#2962ff] hover:bg-[#1e53e5] text-white rounded font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!connected}
          onClick={handleSend}
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default GeminiVoicePanel;


import React, { useEffect, useRef, useState } from "react";
import { GeminiLiveClient, GeminiLiveEvent, GeminiLiveToolResponse } from "../services/GeminiLiveClient";
import { useTradingContextForAI } from "../hooks/useTradingContextForAI";

const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000';

const GeminiVoicePanel: React.FC = () => {
  const [connected, setConnected] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [pendingInput, setPendingInput] = useState("");
  const clientRef = useRef<GeminiLiveClient | null>(null);

  // We can grab client-side context (e.g. journal insights) here
  const { journalInsights } = useTradingContextForAI();
  // We'll store a ref to journalInsights so the callback can access the latest
  const journalRef = useRef(journalInsights);
  useEffect(() => { journalRef.current = journalInsights; }, [journalInsights]);

  useEffect(() => {
    const client = new GeminiLiveClient({
      systemPrompt:
        "You are the Gemini Live side of the AI trading squad. You help analyze US30/NAS100/XAU, explain confluence between HTF/LTF structure and the user's account risk. You MUST use tools to get real data.",
      onEvent: async (evt: GeminiLiveEvent) => {
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
          const calls = evt.calls;
          pushLog(`🛠 Tool call(s): ${calls.map(c => c.name).join(', ')}`);
          
          const responses: GeminiLiveToolResponse[] = [];

          for (const call of calls) {
            if (call.name === 'get_trading_context') {
               try {
                 // Fetch broker snapshot from backend
                 const res = await fetch(`${API_BASE_URL}/api/broker/snapshot`);
                 const json = await res.json();
                 
                 // Combine with local journal insights
                 const combinedContext = {
                    brokerSnapshot: json.snapshot,
                    journalInsights: journalRef.current,
                    scope: call.args.scope
                 };
                 
                 responses.push({
                   id: call.id,
                   name: call.name,
                   result: combinedContext
                 });
                 pushLog('Fetched trading context.');
               } catch (e) {
                 responses.push({
                   id: call.id,
                   name: call.name,
                   result: { error: "Failed to fetch context" }
                 });
               }
            } else if (call.name === 'run_autopilot_review') {
               try {
                 const { symbol, side, entry, stopLoss, takeProfit, riskPct, reasoningSummary } = call.args as any;
                 
                 // Construct a candidate plan object for the backend
                 const candidatePlan = {
                    symbol: symbol || "UNKNOWN",
                    direction: String(side).toLowerCase() === "buy" ? "long" : "short",
                    entry: Number(entry),
                    stopLoss: Number(stopLoss),
                    takeProfits: [Number(takeProfit)],
                    riskPct: Number(riskPct),
                    rationale: reasoningSummary || "Voice review request",
                    timeframe: (call.args.timeFrame as string) || "15m"
                 };

                 // Fetch latest snapshot again for fresh check
                 const snapRes = await fetch(`${API_BASE_URL}/api/broker/snapshot`);
                 const snapJson = await snapRes.json();

                 const reviewPayload = {
                    brokerSnapshot: snapJson.snapshot,
                    candidatePlan,
                    journalInsights: journalRef.current,
                    riskProfile: 'balanced'
                 };

                 const reviewRes = await fetch(`${API_BASE_URL}/api/openai/autopilot/review`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(reviewPayload)
                 });
                 
                 const reviewJson = await reviewRes.json();
                 
                 responses.push({
                   id: call.id,
                   name: call.name,
                   result: reviewJson
                 });
                 pushLog(`Autopilot review complete. Approved: ${reviewJson.approved}`);
               } catch (e: any) {
                 responses.push({
                   id: call.id,
                   name: call.name,
                   result: { error: `Review failed: ${e.message}` }
                 });
               }
            } else {
               responses.push({
                 id: call.id,
                 name: call.name,
                 result: { error: `Unknown tool: ${call.name}` }
               });
            }
          }
          
          client.sendToolResponse(responses);
        }
      },
    });

    clientRef.current = client;
    
    return () => {
      client.close();
    };
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
        {log.length === 0 && <span className="text-gray-600 italic">Session log empty... Try saying "What is my account status?" or "Review a long on US30".</span>}
        {log.map((line, idx) => (
          <div key={idx} className="break-words">{line}</div>
        ))}
      </div>

      {/* Text input */}
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

// src/components/OpenAIVoiceAutopilotPanel.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  OpenAIRealtimeClient,
  OpenAIToolSchema,
} from "../services/OpenAIRealtimeClient";
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

  // Define tools once
  const tools: OpenAIToolSchema[] = [
    {
      type: "function",
      name: "get_chart_playbook",
      description:
        "Fetches one or more saved strategy playbooks for a given symbol/timeframe/direction. " +
        "Use this whenever you are planning a trade and want to anchor the plan to a known playbook.",
      parameters: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Trading symbol, e.g. US30, NAS100, XAUUSD.",
          },
          timeframe: {
            type: "string",
            description: "Chart timeframe like '1m', '5m', '15m', '1h'.",
          },
          direction: {
            type: "string",
            enum: ["long", "short", "neutral"],
            description: "Intended trade direction.",
          },
        },
        required: ["symbol"],
      },
    },
    {
      type: "function",
      name: "log_trade_journal",
      description:
        "Logs a planned or completed trade into the user's trading journal. " +
        "Call this when you finalize a trade idea or after a trade closes.",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string" },
          timeframe: { type: "string" },
          direction: { type: "string", enum: ["long", "short", "neutral"] },
          entryPrice: { type: "number" },
          stopLoss: { type: "number" },
          takeProfit: { type: "number" },
          size: {
            type: "number",
            description: "Position size (lots or contracts).",
          },
          accountEquity: {
            type: "number",
            description: "Account equity at the time of logging.",
          },
          resultRMultiple: {
            type: "number",
            description:
              "R-multiple result (e.g. 1.5 for +1.5R, -1 for full loss).",
          },
          outcome: {
            type: "string",
            description:
              "Status of the trade: win, loss, BE (break even), planned, canceled.",
          },
          notes: {
            type: "string",
            description:
              "Any human-readable notes, lessons, or context for this trade.",
          },
          agentName: {
            type: "string",
            description: "Which agent or squad proposed this trade.",
          },
          autopilotMode: {
            type: "string",
            description: "confirm | auto | sim",
          },
          meta: {
            type: "object",
            description: "Optional extra metadata about this trade.",
            additionalProperties: true,
          },
        },
        required: ["symbol"],
      },
    },
  ];

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
        "You are an AI trading squad (strategist, risk manager, quant analyst, " +
        "and execution bot) helping manage a prop-firm style trading account. " +
        "Always respect risk limits and ask for clarification before aggressive trades. " +
        "Use get_chart_playbook to ground your plans in stored playbooks, and " +
        "log_trade_journal to record trades and lessons.",
      tools,
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
          pushLog(`⚠️ Error: ${String((err as any)?.message ?? err)}`);
        },
        onText: (text, isFinal) => {
          pushLog(`OpenAI Squad: ${text}${isFinal ? " (final)" : ""}`);
        },
      },
      onToolCall: async (name, args, callId) => {
        try {
          if (name === "get_chart_playbook") {
            pushLog(
              `🛠 Tool call: get_chart_playbook(${JSON.stringify(args)})`
            );
            const params = new URLSearchParams();
            if (args.symbol) params.set("symbol", String(args.symbol));
            if (args.timeframe) params.set("timeframe", String(args.timeframe));
            if (args.direction) params.set("direction", String(args.direction));

            const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000';
            const resp = await fetch(
              `${API_BASE_URL}/api/tools/playbooks?${params.toString()}`
            );
            const json = await resp.json();
            client.sendToolResult(callId, json);
          } else if (name === "log_trade_journal") {
            pushLog(
              `🛠 Tool call: log_trade_journal(${JSON.stringify(args)})`
            );
            const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000';
            const resp = await fetch(`${API_BASE_URL}/api/tools/journal-entry`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(args),
            });
            const json = await resp.json();
            client.sendToolResult(callId, json);
          } else {
            pushLog(`🛠 Unknown tool: ${name}`);
            client.sendToolResult(callId, {
              ok: false,
              error: `Unknown tool: ${name}`,
            });
          }
        } catch (err) {
          console.error("Tool handler error", err);
          pushLog(`⚠️ Tool error: ${String((err as any)?.message ?? err)}`);
          client.sendToolResult(callId, {
            ok: false,
            error: "Tool handler threw an error",
          });
        }
      },
    });

    clientRef.current = client;
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
    <div className="flex flex-col h-full bg-black/70 text-xs text-slate-200 p-3 rounded">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold text-sm">
          OpenAI Realtime Autopilot Squad
        </div>
        <div
          className={
            "px-2 py-0.5 rounded text-[10px] " +
            (connected ? "bg-emerald-600/70" : "bg-red-600/70")
          }
        >
          {connected ? "Online" : "Offline"}
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-black/60 border border-white/10 rounded p-2 space-y-1 font-mono">
        {log.map((line, idx) => (
          <div key={idx}>{line}</div>
        ))}
      </div>

      <div className="mt-2 flex gap-2">
        <input
          className="flex-1 bg-black/80 border border-white/20 rounded px-2 py-1 text-white text-xs"
          placeholder="Talk to your OpenAI trading squad…"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
        />
        <button
          className="px-3 py-1 rounded bg-emerald-600 text-white text-xs"
          onClick={handleSend}
        >
          Send
        </button>
      </div>

      <p className="mt-2 text-[10px] opacity-60">
        The squad can now call <code>get_chart_playbook</code> to fetch saved
        playbooks and <code>log_trade_journal</code> to record trades and
        lessons, with results streamed back through Realtime and your voice
        bus.
      </p>
    </div>
  );
};

export default OpenAIVoiceAutopilotPanel;
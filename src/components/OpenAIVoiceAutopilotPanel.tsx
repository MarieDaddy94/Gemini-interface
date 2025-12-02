
import React, { useEffect, useRef, useState } from "react";
import {
  OpenAIRealtimeClient,
  OpenAIToolSchema,
} from "../services/OpenAIRealtimeClient";
import { useRealtimeConfig } from "../context/RealtimeConfigContext";
import AutopilotProposalCard, {
  AutopilotProposal,
} from "./AutopilotProposalCard";
import { recordToolActivity } from "../services/toolActivityBus";

const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000';

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

  const [proposal, setProposal] = useState<AutopilotProposal | null>(null);
  const [proposalStatus, setProposalStatus] = useState<string | null>(null);

  const pushLog = (line: string) => {
    setLog((prev) => [...prev, line].slice(-300));
  };

  // Tools: playbook lookup, journaling, autopilot proposal (with vision hook)
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
          visionSummary: {
            type: "string",
            description:
              "Optional summary of what the vision model sees on the chart (structure, liquidity, etc.).",
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
    {
      type: "function",
      name: "get_autopilot_proposal",
      description:
        "Ask the backend risk engine to compute a structured trade proposal " +
        "with position size and basic risk checks. Use this when turning a " +
        "playbook into an actionable trade.",
      parameters: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Symbol, e.g. 'US30'.",
          },
          timeframe: {
            type: "string",
            description: "Execution timeframe, e.g. '1m', '5m', '15m'.",
          },
          direction: {
            type: "string",
            enum: ["long", "short"],
            description: "Trade direction.",
          },
          accountEquity: {
            type: "number",
            description: "Current account equity.",
          },
          riskPercent: {
            type: "number",
            description:
              "Risk as percent of equity per trade (e.g. 0.5 = 0.5%).",
          },
          mode: {
            type: "string",
            description: "confirm | auto | sim",
          },
          entryPrice: {
            type: "number",
            description: "Planned entry price.",
          },
          stopLossPrice: {
            type: "number",
            description: "Planned stop loss price.",
          },
          rMultipleTarget: {
            type: "number",
            description: "Target R multiple, e.g. 3 for 3R.",
          },
          visionSummary: {
            type: "string",
            description:
              "Short summary from vision about the chart (structure, liquidity, etc.).",
          },
          notes: {
            type: "string",
            description:
              "Any extra natural-language context you want the risk engine to store.",
          },
        },
        required: ["symbol", "timeframe", "direction"],
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
        "Use get_chart_playbook to ground your plans in stored playbooks, " +
        "get_autopilot_proposal to compute precise risk and position sizing, " +
        "and log_trade_journal to record trades and lessons.",
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
            recordToolActivity({
              provider: "openai",
              name,
              status: "pending",
              args,
            });

            const params = new URLSearchParams();
            if (args.symbol) params.set("symbol", String(args.symbol));
            if (args.timeframe)
              params.set("timeframe", String(args.timeframe));
            if (args.direction)
              params.set("direction", String(args.direction));

            try {
              const resp = await fetch(
                `${API_BASE_URL}/api/tools/playbooks?${params.toString()}`
              );
              if (!resp.ok) {
                const errText = await resp.text();
                recordToolActivity({
                  provider: "openai",
                  name,
                  status: "error",
                  args,
                  errorMessage: errText || `HTTP ${resp.status}`,
                });
                throw new Error(`API ${resp.status}: ${errText}`);
              }
              const json = await resp.json();
              recordToolActivity({
                provider: "openai",
                name,
                status: "ok",
                args,
              });
              client.sendToolResult(callId, json);
            } catch (err: any) {
              pushLog(`❌ Error fetching playbooks: ${err.message}`);
              recordToolActivity({
                provider: "openai",
                name,
                status: "error",
                args,
                errorMessage: err.message,
              });
              client.sendToolResult(callId, { error: `Failed to get playbooks: ${err.message}` });
            }

          } else if (name === "log_trade_journal") {
            pushLog(
              `🛠 Tool call: log_trade_journal(${JSON.stringify(args)})`
            );
            recordToolActivity({
              provider: "openai",
              name,
              status: "pending",
              args,
            });

            try {
              const resp = await fetch(`${API_BASE_URL}/api/tools/journal-entry`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(args),
              });
              if (!resp.ok) {
                const errText = await resp.text();
                recordToolActivity({
                  provider: "openai",
                  name,
                  status: "error",
                  args,
                  errorMessage: errText || `HTTP ${resp.status}`,
                });
                throw new Error(`API ${resp.status}: ${errText}`);
              }
              const json = await resp.json();
              recordToolActivity({
                provider: "openai",
                name,
                status: "ok",
                args,
              });
              client.sendToolResult(callId, json);
              pushLog("✅ Journal entry logged successfully.");
            } catch (err: any) {
              pushLog(`❌ Error logging journal: ${err.message}`);
              recordToolActivity({
                provider: "openai",
                name,
                status: "error",
                args,
                errorMessage: err.message,
              });
              client.sendToolResult(callId, { error: `Failed to log journal: ${err.message}` });
            }

          } else if (name === "get_autopilot_proposal") {
            pushLog(
              `🛠 Tool call: get_autopilot_proposal(${JSON.stringify(args)})`
            );
            recordToolActivity({
              provider: "openai",
              name,
              status: "pending",
              args,
            });
            setProposalStatus("Generating proposal…");
            
            try {
              const resp = await fetch(`${API_BASE_URL}/api/tools/autopilot-proposal`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(args),
              });

              if (!resp.ok) {
                const errText = await resp.text();
                recordToolActivity({
                  provider: "openai",
                  name,
                  status: "error",
                  args,
                  errorMessage: errText || `HTTP ${resp.status}`,
                });
                throw new Error(`API ${resp.status}: ${errText}`);
              }

              const json = await resp.json();

              // Surface into UI card
              if (json?.proposal) {
                setProposal(json.proposal as AutopilotProposal);
                setProposalStatus(
                  json.ok
                    ? "Proposal ready – risk engine status OK."
                    : "Proposal ready – risk engine flagged issues. Review before sending."
                );
              } else {
                setProposal(null);
                setProposalStatus("No proposal returned from risk engine.");
              }

              recordToolActivity({
                provider: "openai",
                name,
                status: "ok",
                args,
              });

              // Also send back into the model
              client.sendToolResult(callId, json);
            } catch (err: any) {
              setProposalStatus(`Error generating proposal: ${err.message}`);
              pushLog(`❌ Error generating proposal: ${err.message}`);
              recordToolActivity({
                provider: "openai",
                name,
                status: "error",
                args,
                errorMessage: err.message,
              });
              client.sendToolResult(callId, { error: `Failed to generate proposal: ${err.message}` });
            }

          } else {
            pushLog(`🛠 Unknown tool: ${name}`);
            recordToolActivity({
              provider: "openai",
              name,
              status: "error",
              args,
              errorMessage: "Unknown tool",
            });
            client.sendToolResult(callId, {
              ok: false,
              error: `Unknown tool: ${name}`,
            });
          }
        } catch (err) {
          console.error("Tool handler error", err);
          pushLog(`⚠️ Tool handler error: ${String((err as any)?.message ?? err)}`);
          recordToolActivity({
            provider: "openai",
            name: "unknown_error",
            status: "error",
            args: {},
            errorMessage: String((err as any)?.message ?? err),
          });
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

  // 🔗 This is where you hook in your TradeLocker connector.
  const handleApproveProposal = async (p: AutopilotProposal) => {
    try {
      setProposalStatus("Sending order to broker…");

      // Placeholder execution call
      const resp = await fetch(`${API_BASE_URL}/api/autopilot/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: 'auto',
          source: 'voice-autopilot-card',
          command: {
            type: 'open',
            symbol: p.symbol,
            side: p.direction === 'long' ? 'BUY' : 'SELL',
            qty: p.positionSizeUnits ?? 0.01,
            entryType: 'market',
            price: p.entryPrice,
            stopPrice: p.entryPrice, // for stop orders if needed
            slPrice: p.stopLossPrice,
            tpPrice: p.takeProfitPrice
          }
        }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        setProposalStatus(
          `Broker error ${resp.status}: ${text || "failed to execute"}`
        );
        return;
      }

      const json = await resp.json();
      setProposalStatus(
        json.ok
          ? "✅ Order sent to broker successfully."
          : `⚠️ Broker response: ${json.error || "unknown status"}`
      );
    } catch (err: any) {
      console.error("Autopilot approve error", err);
      setProposalStatus(
        `⚠️ Failed to send to broker: ${err?.message ?? String(err)}`
      );
    }
  };

  const handleRejectProposal = () => {
    setProposal(null);
    setProposalStatus("Proposal cleared. You can ask the squad to adjust it.");
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

      {/* Autopilot proposal card (if present) */}
      {proposal && (
        <AutopilotProposalCard
          proposal={proposal}
          onApprove={handleApproveProposal}
          onReject={handleRejectProposal}
        />
      )}

      {proposalStatus && (
        <div className="mb-2 text-[11px] opacity-80">
          {proposalStatus}
        </div>
      )}

      {/* Log console */}
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
        playbooks, <code>get_autopilot_proposal</code> to compute risk and
        position sizing (using vision notes if provided), and{" "}
        <code>log_trade_journal</code> to record trades and lessons.
      </p>
    </div>
  );
};

export default OpenAIVoiceAutopilotPanel;

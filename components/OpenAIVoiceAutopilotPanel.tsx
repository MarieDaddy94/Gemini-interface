
import React, { useCallback, useEffect, useState } from "react";
import { RealtimeAgent, RealtimeSession } from "@openai/agents-realtime";
import { tool } from "@openai/agents";
import { z } from "zod";
import { useTradingContextForAI } from "../hooks/useTradingContextForAI";

type ConnectionState = "idle" | "connecting" | "connected" | "error";

interface AutopilotReviewResult {
  approved: boolean;
  riskScore: number;
  reasons: string[];
  requiredChanges: string[];
  adjustedPlan?: {
    symbol: string;
    direction: "long" | "short";
    entry: number;
    stopLoss: number;
    takeProfits: number[];
    riskPct: number;
    rationale: string;
    timeframe: string;
    maxLossDollars?: number;
    maxLossPct?: number;
  };
}

const OpenAIVoiceAutopilotPanel: React.FC = () => {
  const [session, setSession] = useState<RealtimeSession | null>(null);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("idle");
  const [error, setError] = useState<string | null>(null);

  const { brokerSnapshot, journalInsights } = useTradingContextForAI();

  // Tool 1: Expose the latest trading context
  const getTradingContextTool = tool({
    name: "get_trading_context",
    description:
      "Returns the latest broker snapshot, open positions and recent journal insights.",
    // No parameters, it's just a fetch of local state
    parameters: z.object({}),
    async execute() {
      return {
        brokerSnapshot,
        journalInsights,
      };
    },
  });

  // Tool 2: Call backend reasoning gate for a candidate plan
  const reviewAutopilotPlanTool = tool({
    name: "review_autopilot_plan",
    description:
      "Send a candidate trade plan plus current context to the backend Autopilot Risk Engine. Returns approval + adjusted plan.",
    parameters: z.object({
      candidatePlan: z.object({
        symbol: z.string(),
        direction: z.enum(["long", "short"]),
        entry: z.number(),
        stopLoss: z.number(),
        takeProfits: z.array(z.number()).nonempty(),
        riskPct: z.number(), // e.g. 0.5 for 0.5% of equity
        rationale: z.string(),
        timeframe: z.string(),
      }),
      riskProfile: z
        .enum(["ultra_conservative", "conservative", "balanced", "aggressive"])
        .default("balanced")
        .optional(),
    }),
    async execute({ candidatePlan, riskProfile }) {
      const payload = {
        brokerSnapshot,
        candidatePlan,
        visionSummary: null, // Placeholder for future vision data
        journalInsights,
        riskProfile: riskProfile ?? "balanced",
      };

      const res = await fetch("/api/openai/autopilot/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Autopilot review error:", text);
        throw new Error("Autopilot review failed");
      }

      const json = (await res.json()) as AutopilotReviewResult;
      return json;
    },
  });

  const connectSession = useCallback(async () => {
    setError(null);
    setConnectionState("connecting");

    try {
      // 1) Ask backend for ephemeral key
      const resp = await fetch("/api/openai/realtime-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-realtime-preview-2024-12-17" }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        console.error("Failed to get realtime token:", text);
        setError("Failed to get realtime token");
        setConnectionState("error");
        return;
      }

      const { key } = (await resp.json()) as { key: string };

      // 2) Create agent with tools hooked into your app
      const agent = new RealtimeAgent({
        name: "Trading Squad Voice",
        instructions: `
You are the VOICE INTERFACE for an AI trading squad supporting a discretionary index trader.

- You see tools: "get_trading_context" and "review_autopilot_plan".
- ALWAYS call "get_trading_context" early in the conversation so you understand current equity, open PnL and journal patterns.
- When the user asks for a plan or says things like "plan a long on US30", you should:
  1) Call "get_trading_context".
  2) Propose a candidatePlan object.
  3) Call "review_autopilot_plan" with that candidatePlan.
  4) Explain the returned result (riskScore, approved or not, and adjustedPlan) back to the user in plain language.

Risk philosophy:
- Preserve capital first.
- If the user is in drawdown, become more conservative.
- Avoid over-leverage and revenge trading.
        `,
        tools: [getTradingContextTool, reviewAutopilotPlanTool],
      });

      // 3) Create realtime session
      const newSession = new RealtimeSession(agent, {
        model: "gpt-4o-realtime-preview-2024-12-17",
      });

      // Optionally hook up some events for debugging UI
      newSession.on("transport-stateChanged", (state) => {
        if (state.state === "connected") setConnectionState("connected");
        if (state.state === "disconnected") setConnectionState("idle");
      });

      newSession.on("error", (e) => {
        console.error("[RealtimeSession error]", e);
        setError("Realtime session error");
        setConnectionState("error");
      });

      await newSession.connect({
        apiKey: key, // ephemeral key from backend
      });

      setSession(newSession);
      setConnectionState("connected");
    } catch (e: any) {
      console.error("Failed to connect realtime session:", e);
      setError(e?.message || "Failed to connect");
      setConnectionState("error");
    }
  }, [brokerSnapshot, journalInsights, getTradingContextTool, reviewAutopilotPlanTool]);

  const disconnectSession = useCallback(async () => {
    if (!session) return;
    try {
      await session.disconnect();
    } catch (e) {
      console.error("Error disconnecting session:", e);
    } finally {
      setSession(null);
      setConnectionState("idle");
    }
  }, [session]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (session) {
        session.disconnect().catch(() => undefined);
      }
    };
  }, [session]);

  return (
    <div className="flex flex-col gap-3 p-4 bg-[#161a25] border border-[#2a2e39] rounded-lg mt-4">
      <div className="flex items-center justify-between border-b border-gray-700 pb-2">
        <div>
          <h2 className="text-sm font-bold text-gray-200">OpenAI Voice Autopilot</h2>
          <p className="text-[10px] text-gray-500">
            Realtime reasoning agent with live context access.
          </p>
        </div>
        <div className="flex items-center gap-2">
           <div className={`w-2 h-2 rounded-full ${connectionState === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-gray-600'}`}></div>
           <span className="text-[10px] font-mono uppercase text-gray-400">{connectionState}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {connectionState !== "connected" ? (
          <button 
            onClick={connectSession} 
            disabled={connectionState === "connecting"}
            className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded text-[11px] font-bold uppercase transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {connectionState === "connecting" ? "Connecting..." : "Connect & Start"}
          </button>
        ) : (
          <button 
            onClick={disconnectSession}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded text-[11px] font-bold uppercase transition-colors"
          >
            Disconnect
          </button>
        )}
      </div>

      {error && <div className="text-[10px] text-red-400 bg-red-900/20 p-2 rounded border border-red-900/40">{error}</div>}

      <div className="bg-[#0a0c10] p-2 rounded border border-gray-800 text-[10px] text-gray-400">
        <p className="mb-1 font-semibold text-gray-500 uppercase">Try asking:</p>
        <ul className="list-disc list-inside space-y-0.5 text-gray-300">
          <li>“Plan a conservative long on US30 with 0.5% risk.”</li>
          <li>“Given my equity and recent losses, what is a safe play?”</li>
          <li>“Run this idea through the risk engine before we execute.”</li>
        </ul>
      </div>
    </div>
  );
};

export default OpenAIVoiceAutopilotPanel;

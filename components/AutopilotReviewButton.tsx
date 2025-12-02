
import React, { useState } from "react";
import { buildVisionSummaryForAutopilot } from "../utils/buildVisionSummaryForAutopilot";
import {
  VisionResult,
  ChartVisionAnalysis,
  LiveWatchResult,
  JournalVisionResult,
} from "../types";
import { useTradingContextForAI } from "../hooks/useTradingContextForAI";

interface Props {
  candidatePlan: {
    symbol: string;
    direction: "long" | "short";
    entry: number;
    stopLoss: number;
    takeProfits: number[];
    riskPct: number;
    rationale: string;
    timeframe: string;
  };

  chartVision?: VisionResult | null;
  mtfAnalysis?: ChartVisionAnalysis | null;
  liveWatch?: LiveWatchResult | null;
  journalVision?: JournalVisionResult | null;
}

const AutopilotReviewButton: React.FC<Props> = ({
  candidatePlan,
  chartVision,
  mtfAnalysis,
  liveWatch,
  journalVision,
}) => {
  const { brokerSnapshot, journalInsights } = useTradingContextForAI();
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setError(null);
    setResult(null);

    const visionSummary = buildVisionSummaryForAutopilot({
      chartVision: chartVision ?? null,
      mtfAnalysis: mtfAnalysis ?? null,
      liveWatch: liveWatch ?? null,
      journalVision: journalVision ?? null,
    });

    const payload = {
      brokerSnapshot,
      candidatePlan,
      visionSummary,
      journalInsights,
      riskProfile: "balanced" as const,
    };

    setIsLoading(true);
    try {
      const res = await fetch("/api/openai/autopilot/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Autopilot review failed:", text);
        setError("Autopilot review failed");
        return;
      }

      const json = await res.json();
      setResult(json);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Unexpected error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="autopilot-review-block">
      <button 
        onClick={handleClick} 
        disabled={isLoading}
        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] rounded font-medium transition-colors disabled:opacity-50"
      >
        {isLoading ? "Reviewing with Vision…" : "Review Plan + Vision"}
      </button>

      {error && <div className="text-[10px] text-red-400 mt-1">{error}</div>}

      {result && (
        <div className="mt-2 text-[10px] bg-[#101018] border border-gray-700 rounded p-2 text-gray-300">
          <div className="flex justify-between items-center mb-1">
            <span className="font-semibold text-gray-200">Risk Engine Verdict</span>
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${result.approved ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
              {result.approved ? "APPROVED" : "REJECTED"}
            </span>
          </div>
          <div className="mb-2 text-[9px] text-gray-500">Risk Score: {result.riskScore}/100</div>
          
          {result.reasons && result.reasons.length > 0 && (
            <div className="mb-2">
              <div className="text-red-400 font-semibold mb-0.5">Flagged Reasons:</div>
              <ul className="list-disc list-inside text-gray-400">
                {result.reasons.map((r: string, idx: number) => (
                  <li key={idx}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          
          {result.adjustedPlan && (
            <div>
              <div className="text-blue-400 font-semibold mb-0.5">Engine Adjusted Plan:</div>
              <pre className="text-[9px] whitespace-pre-wrap bg-black/40 p-1.5 rounded font-mono text-gray-400 border border-gray-800">
                {JSON.stringify(result.adjustedPlan, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AutopilotReviewButton;

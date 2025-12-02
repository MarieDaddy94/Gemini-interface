import React from "react";

export type AutopilotProposal = {
  symbol: string | null;
  timeframe: string | null;
  direction: string | null;
  mode: string;
  accountEquity: number;
  riskPercent: number;
  riskAmount: number;
  entryPrice: number | null;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  rMultipleTarget: number;
  positionSizeUnits: number | null;
  visionSummary?: string;
  notes?: string;
  riskEngine?: {
    status: "ok" | "review" | string;
    recommendedMaxRiskPercent: number;
    minEquityForTrading: number;
    flags: string[];
  };
};

type Props = {
  proposal: AutopilotProposal;
  onApprove: (proposal: AutopilotProposal) => void;
  onReject: () => void;
};

const formatNumber = (n: number | null | undefined, digits = 2) => {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  return Number(n).toFixed(digits);
};

const AutopilotProposalCard: React.FC<Props> = ({
  proposal,
  onApprove,
  onReject,
}) => {
  const {
    symbol,
    timeframe,
    direction,
    mode,
    accountEquity,
    riskPercent,
    riskAmount,
    entryPrice,
    stopLossPrice,
    takeProfitPrice,
    rMultipleTarget,
    positionSizeUnits,
    visionSummary,
    notes,
    riskEngine,
  } = proposal;

  const riskStatus = riskEngine?.status ?? "ok";
  const isReview = riskStatus !== "ok";

  const flagLabels: Record<string, string> = {
    equity_too_low: "Account equity below minimum threshold.",
    risk_percent_above_recommended:
      "Risk % is above the recommended max for one trade.",
    missing_entry_or_stop: "Entry or stop loss price is missing.",
    zero_or_invalid_distance:
      "Entry and stop are too close or invalid – check your levels.",
  };

  return (
    <div className="mb-3 rounded border border-amber-400/40 bg-black/80 p-3 text-xs text-slate-100 shadow-lg">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold text-sm">
          Autopilot Proposal – {symbol ?? "?"} ({timeframe ?? "?"})
        </div>
        <span
          className={
            "px-2 py-0.5 rounded text-[10px] uppercase " +
            (isReview
              ? "bg-amber-700/80 border border-amber-400"
              : "bg-emerald-700/80 border border-emerald-400")
          }
        >
          {riskStatus === "ok" ? "Risk OK" : "Review Required"}
        </span>
      </div>

      {/* Core trade block */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div className="space-y-1">
          <div>
            <span className="opacity-60 mr-1">Direction:</span>
            <span className="font-semibold uppercase">
              {direction ?? "-"}
            </span>
          </div>
          <div>
            <span className="opacity-60 mr-1">Mode:</span>
            <span className="font-semibold uppercase">{mode}</span>
          </div>
          <div>
            <span className="opacity-60 mr-1">Entry:</span>
            <span>{formatNumber(entryPrice, 2)}</span>
          </div>
          <div>
            <span className="opacity-60 mr-1">Stop:</span>
            <span>{formatNumber(stopLossPrice, 2)}</span>
          </div>
          <div>
            <span className="opacity-60 mr-1">Take Profit:</span>
            <span>{formatNumber(takeProfitPrice, 2)}</span>
          </div>
        </div>

        <div className="space-y-1">
          <div>
            <span className="opacity-60 mr-1">Equity:</span>
            <span>${formatNumber(accountEquity, 2)}</span>
          </div>
          <div>
            <span className="opacity-60 mr-1">Risk / Trade:</span>
            <span>
              {formatNumber(riskPercent, 2)}% (~$
              {formatNumber(riskAmount, 2)})
            </span>
          </div>
          <div>
            <span className="opacity-60 mr-1">Target:</span>
            <span>{formatNumber(rMultipleTarget, 2)}R</span>
          </div>
          <div>
            <span className="opacity-60 mr-1">Position Size:</span>
            <span>{formatNumber(positionSizeUnits, 3)} units</span>
          </div>
          {riskEngine && (
            <div>
              <span className="opacity-60 mr-1">Rec. Max Risk:</span>
              <span>{formatNumber(riskEngine.recommendedMaxRiskPercent, 2)}%</span>
            </div>
          )}
        </div>
      </div>

      {/* Vision + notes */}
      {(visionSummary || notes) && (
        <div className="mb-2 space-y-1">
          {visionSummary && (
            <div>
              <div className="text-[10px] uppercase opacity-60">
                Vision Summary
              </div>
              <div className="text-[11px] leading-snug">{visionSummary}</div>
            </div>
          )}
          {notes && (
            <div>
              <div className="text-[10px] uppercase opacity-60">
                Autopilot Notes
              </div>
              <div className="text-[11px] leading-snug">{notes}</div>
            </div>
          )}
        </div>
      )}

      {/* Risk flags */}
      {riskEngine?.flags?.length ? (
        <div className="mb-2">
          <div className="text-[10px] uppercase opacity-60 mb-1">
            Risk Checks
          </div>
          <ul className="list-disc list-inside text-[11px] space-y-0.5 text-amber-200">
            {riskEngine.flags.map((f) => (
              <li key={f}>{flagLabels[f] ?? f}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="mb-2 text-[11px] text-emerald-300">
          ✅ No major risk flags from the backend engine.
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex gap-2">
          <button
            className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px]"
            onClick={() => onApprove(proposal)}
          >
            Approve & Send to Broker
          </button>
          <button
            className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 text-[11px]"
            onClick={onReject}
          >
            Reject / Adjust
          </button>
        </div>
        <div className="text-[10px] opacity-60">
          Approval will use your connected broker / TradeLocker settings.
        </div>
      </div>
    </div>
  );
};

export default AutopilotProposalCard;
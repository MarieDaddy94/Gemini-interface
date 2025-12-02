
import {
  VisionResult,
  ChartVisionAnalysis,
  LiveWatchResult,
  JournalVisionResult,
} from "../types";

export interface VisionSummaryForAutopilot {
  primarySymbol?: string;
  primaryTimeframe?: string;
  textSummary: string;
  chartBias?: "bullish" | "bearish" | "choppy" | "unclear";
  htfBias?: "bullish" | "bearish" | "choppy" | "unclear";
  ltfBias?: "bullish" | "bearish" | "choppy" | "unclear";
  alignmentScorePct?: number;
  liveWatchStatus?:
    | "not_reached"
    | "just_touched"
    | "in_play"
    | "invalidated"
    | "tp_hit"
    | "sl_hit";
  liveWatchComment?: string;
  journalCoachSummary?: string;
}

export function buildVisionSummaryForAutopilot(params: {
  chartVision?: VisionResult | null;           
  mtfAnalysis?: ChartVisionAnalysis | null;    
  liveWatch?: LiveWatchResult | null;          
  journalVision?: JournalVisionResult | null;  
}): VisionSummaryForAutopilot | null {
  const { chartVision, mtfAnalysis, liveWatch, journalVision } = params;

  if (!chartVision && !mtfAnalysis && !liveWatch && !journalVision) {
    return null;
  }

  const primarySymbol =
    mtfAnalysis?.symbol ??
    chartVision?.analysis?.symbol ??
    liveWatch?.plan?.symbol ??
    undefined;

  const primaryTimeframe =
    mtfAnalysis?.timeframe ??
    chartVision?.analysis?.timeframe ??
    liveWatch?.plan?.timeframe ??
    undefined;

  const lines: string[] = [];

  if (chartVision) {
    lines.push("[Chart Vision]");
    if (chartVision.summary) lines.push(chartVision.summary);
    if (chartVision.analysis?.structureNotes) {
      lines.push("Structure: " + chartVision.analysis.structureNotes);
    }
    if (chartVision.analysis?.liquidityNotes) {
      lines.push("Liquidity: " + chartVision.analysis.liquidityNotes);
    }
  }

  if (mtfAnalysis) {
    lines.push("[Multi-Timeframe Vision]");
    lines.push(
      `HTF=${mtfAnalysis.htfBias || "n/a"}, LTF=${mtfAnalysis.ltfBias || "n/a"},` +
        ` align=${
          typeof mtfAnalysis.alignmentScore === "number"
            ? Math.round(mtfAnalysis.alignmentScore * 100) + "%"
            : "n/a"
        }`
    );
    if (mtfAnalysis.structureNotes) {
      lines.push("MTF Structure: " + mtfAnalysis.structureNotes);
    }
  }

  if (liveWatch) {
    lines.push("[Live Watch]");
    lines.push(
      `Status=${liveWatch.analysis.status}, comment=${liveWatch.analysis.comment}`
    );
  }

  if (journalVision) {
    lines.push("[Journal Coach]");
    if (journalVision.analysis.coachingNotes) {
      lines.push(journalVision.analysis.coachingNotes);
    }
  }

  const textSummary = lines.join("\n");

  return {
    primarySymbol,
    primaryTimeframe,
    textSummary,
    chartBias: chartVision?.analysis?.marketBias ?? undefined,
    htfBias: mtfAnalysis?.htfBias ?? undefined,
    ltfBias: mtfAnalysis?.ltfBias ?? undefined,
    alignmentScorePct:
      typeof mtfAnalysis?.alignmentScore === "number"
        ? Math.round(mtfAnalysis.alignmentScore * 100)
        : undefined,
    liveWatchStatus: liveWatch?.analysis.status ?? undefined,
    liveWatchComment: liveWatch?.analysis.comment ?? undefined,
    journalCoachSummary:
      journalVision?.analysis.coachingNotes ??
      journalVision?.summary ??
      undefined,
  };
}

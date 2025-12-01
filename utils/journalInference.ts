import { AgentJournalDraft } from "../services/agentApi";

export type InferredDirection = "long" | "short" | undefined;

export interface InferredTradeMeta {
  symbol?: string;
  direction?: InferredDirection;
  sentiment?: string;
  outcome?: string;
}

const LONG_KEYWORDS = [
  "long",
  "buy",
  "bullish",
  "go long",
  "take longs",
  "calls",
  "upside",
  "continuation to the upside",
];

const SHORT_KEYWORDS = [
  "short",
  "sell",
  "bearish",
  "go short",
  "take shorts",
  "puts",
  "downside",
  "continuation to the downside",
];

const BULLISH_KEYWORDS = [
  "bullish",
  "accumulation",
  "demand",
  "support",
  "reversal up",
  "higher low",
  "markup",
];

const BEARISH_KEYWORDS = [
  "bearish",
  "distribution",
  "supply",
  "resistance",
  "reversal down",
  "lower high",
  "markdown",
];

const WIN_KEYWORDS = [
  "tp hit",
  "take profit hit",
  "target hit",
  "closed in profit",
  "winner",
  "profit",
  "green trade",
];

const LOSS_KEYWORDS = [
  "sl hit",
  "stop loss hit",
  "stopped out",
  "closed in loss",
  "loser",
  "red trade",
  "loss",
];

const BE_KEYWORDS = ["breakeven", "b/e", "break-even", "moved to be"];

function textIncludesAny(text: string, list: string[]): boolean {
  return list.some((kw) => text.includes(kw));
}

export function inferTradeMetaFromText(opts: {
  text: string;
  draft?: AgentJournalDraft;
  activeSymbol?: string;
}): InferredTradeMeta {
  const { text, draft, activeSymbol } = opts;
  const lowerText = (text || "").toLowerCase();

  const tagsLower = (draft?.tags ?? []).map((t) => t.toLowerCase());
  const titleLower = (draft?.title || "").toLowerCase();
  const combined = [lowerText, ...tagsLower, titleLower].join(" | ");

  // --- Direction ---
  let direction: InferredDirection = undefined;
  if (textIncludesAny(combined, LONG_KEYWORDS)) {
    direction = "long";
  } else if (textIncludesAny(combined, SHORT_KEYWORDS)) {
    direction = "short";
  }

  // --- Sentiment ---
  let sentiment: string | undefined = undefined;
  if (textIncludesAny(combined, BULLISH_KEYWORDS) && !textIncludesAny(combined, BEARISH_KEYWORDS)) {
    sentiment = "Bullish";
  } else if (
    textIncludesAny(combined, BEARISH_KEYWORDS) &&
    !textIncludesAny(combined, BULLISH_KEYWORDS)
  ) {
    sentiment = "Bearish";
  }

  // --- Outcome (mainly for post-trade journaling) ---
  let outcome: string | undefined = undefined;
  if (textIncludesAny(lowerText, WIN_KEYWORDS)) {
    outcome = "Win";
  } else if (textIncludesAny(lowerText, LOSS_KEYWORDS)) {
    outcome = "Loss";
  } else if (textIncludesAny(lowerText, BE_KEYWORDS)) {
    outcome = "BE";
  }

  // --- Symbol ---
  // Try to infer from draft.symbol or tags, otherwise fall back to active chart symbol
  let symbol: string | undefined = draft?.symbol || undefined;
  if (!symbol && activeSymbol && activeSymbol !== "Auto") {
    symbol = activeSymbol;
  }

  // Light symbol heuristics from tags/title (optional)
  const SYMBOL_HINTS: Record<string, string> = {
    us30: "US30",
    dow: "US30",
    djia: "US30",
    nas100: "NAS100",
    nasdaq: "NAS100",
    nq: "NAS100",
    xauusd: "XAUUSD",
    gold: "XAUUSD",
  };

  if (!symbol) {
    for (const [hint, sym] of Object.entries(SYMBOL_HINTS)) {
      if (combined.includes(hint)) {
        symbol = sym;
        break;
      }
    }
  }

  return {
    symbol,
    direction,
    sentiment,
    outcome,
  };
}
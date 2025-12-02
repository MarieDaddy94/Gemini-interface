// server/toolsData.js

// -----------------------------------------------------------------------------
// Simple in-memory stores for now. These reset on restart but are fully
// functional. Later you can swap this out for SQLite or your existing DB.
// -----------------------------------------------------------------------------

const playbooks = [
  {
    id: "us30-15m-london-breakout-long",
    symbol: "US30",
    timeframe: "15m",
    direction: "long",
    title: "US30 London Session Breakout (Long)",
    description:
      "Look for liquidity sweep of Asian range low, then long back into prior high " +
      "with 1:3 R:R and tight stop under sweep low.",
    tags: ["US30", "index", "breakout", "liquidity", "London"],
    checklist: [
      "Price sweeps Asian session low",
      "Fair Value Gap or order block forms at sweep",
      "Higher-timeframe (H1/H4) bias is bullish",
      "News is clear for next 30–60 minutes",
      "Risk per trade <= 0.5% account equity",
    ],
  },
  {
    id: "us30-15m-london-breakout-short",
    symbol: "US30",
    timeframe: "15m",
    direction: "short",
    title: "US30 London Session Breakout (Short)",
    description:
      "Look for liquidity sweep of Asian range high, then short back into prior low " +
      "with 1:3 R:R and stop above sweep wick.",
    tags: ["US30", "index", "breakout", "liquidity", "London"],
    checklist: [
      "Price sweeps Asian session high",
      "Fair Value Gap forms at the top of the sweep",
      "Higher-timeframe (H1/H4) bias is bearish",
      "No red-folder news about to drop",
      "Risk per trade <= 0.5% account equity",
    ],
  },
];

const journalEntries = [];

// -----------------------------------------------------------------------------
// Playbooks
// -----------------------------------------------------------------------------

function getPlaybooks(filter) {
  const { symbol, timeframe, direction } = filter;
  return playbooks.filter((pb) => {
    if (symbol && pb.symbol.toUpperCase() !== String(symbol).toUpperCase())
      return false;
    if (timeframe && pb.timeframe !== timeframe) return false;
    if (direction && pb.direction !== direction) return false;
    return true;
  });
}

// -----------------------------------------------------------------------------
// Journaling
// -----------------------------------------------------------------------------

function addJournalEntry(entry) {
  const stored = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    ...entry,
  };
  journalEntries.push(stored);
  return stored;
}

function getJournalEntries() {
  return journalEntries.slice().reverse();
}

// -----------------------------------------------------------------------------
// Autopilot proposal (simple risk engine)
// -----------------------------------------------------------------------------

/**
 * Compute an autopilot proposal with basic risk checks.
 *
 * Input shape (all fields optional except symbol/timeframe/direction from tools):
 * {
 *   symbol, timeframe, direction,
 *   accountEquity,         // number
 *   riskPercent,           // number, percent of equity (e.g. 0.5 = 0.5%)
 *   mode,                  // "confirm" | "auto" | "sim"
 *   entryPrice,            // number
 *   stopLossPrice,         // number
 *   rMultipleTarget,       // number, e.g. 3 for 3R
 *   visionSummary,         // string, from vision analysis
 *   notes                  // string, extra context from the model
 * }
 */
function computeAutopilotProposal(input) {
  const symbol = input.symbol || null;
  const timeframe = input.timeframe || null;
  const direction = input.direction || null;
  const mode = input.mode || "confirm";

  const accountEquity = Number(input.accountEquity) || 0;

  // riskPercent is in PERCENT (e.g. 0.5 = 0.5%).
  let riskPercent =
    input.riskPercent !== undefined && input.riskPercent !== null
      ? Number(input.riskPercent)
      : 0.5; // default 0.5%

  if (!isFinite(riskPercent) || riskPercent < 0) riskPercent = 0;
  if (riskPercent > 5) riskPercent = 5; // hard cap at 5% just in case

  const entryPrice =
    input.entryPrice !== undefined && input.entryPrice !== null
      ? Number(input.entryPrice)
      : null;
  const stopLossPrice =
    input.stopLossPrice !== undefined && input.stopLossPrice !== null
      ? Number(input.stopLossPrice)
      : null;

  const rMultipleTarget =
    input.rMultipleTarget !== undefined && input.rMultipleTarget !== null
      ? Number(input.rMultipleTarget)
      : 3; // default 3R

  const visionSummary = input.visionSummary || "";
  const notes = input.notes || "";

  const maxRiskPercentPerTrade = 1.0; // recommended: 1% or less
  const minEquityForTrading = 100; // dollars

  const riskAmount = accountEquity * (riskPercent / 100);

  let distance = null;
  let positionSizeUnits = null;
  let takeProfitPrice = null;

  if (entryPrice !== null && stopLossPrice !== null) {
    distance = Math.abs(entryPrice - stopLossPrice);
    if (distance > 0 && riskAmount > 0) {
      positionSizeUnits = riskAmount / distance;

      const tpDistance = distance * rMultipleTarget;
      if (direction === "long") {
        takeProfitPrice = entryPrice + tpDistance;
      } else if (direction === "short") {
        takeProfitPrice = entryPrice - tpDistance;
      }
    }
  }

  const riskFlags = [];
  if (accountEquity < minEquityForTrading) {
    riskFlags.push("equity_too_low");
  }
  if (riskPercent > maxRiskPercentPerTrade) {
    riskFlags.push("risk_percent_above_recommended");
  }
  if (!entryPrice || !stopLossPrice) {
    riskFlags.push("missing_entry_or_stop");
  }
  if (distance === 0) {
    riskFlags.push("zero_or_invalid_distance");
  }

  const status = riskFlags.length ? "review" : "ok";

  const proposal = {
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
    riskEngine: {
      status, // "ok" or "review"
      recommendedMaxRiskPercent: maxRiskPercentPerTrade,
      minEquityForTrading,
      flags: riskFlags,
    },
  };

  return proposal;
}

module.exports = {
  getPlaybooks,
  addJournalEntry,
  getJournalEntries,
  computeAutopilotProposal,
};
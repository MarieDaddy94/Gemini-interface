// server/toolsData.js

// Simple in-memory stores for now. These reset on restart but are fully functional.
// Later you can swap this out for SQLite or whatever DB you're already using.

const playbooks = [
  {
    id: "us30-15m-london-breakout-long",
    symbol: "US30",
    timeframe: "15m",
    direction: "long",
    title: "US30 London Session Breakout (Long)",
    description:
      "Look for liquidity sweep of Asian range low, then long back into prior high with 1:3 R:R and tight stop under sweep low.",
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
      "Look for liquidity sweep of Asian range high, then short back into prior low with 1:3 R:R and stop above sweep wick.",
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

/**
 * Filter playbooks by symbol/timeframe/direction.
 * If a field is missing, it's treated as a wildcard.
 */
function getPlaybooks(filter) {
  const { symbol, timeframe, direction } = filter;
  return playbooks.filter((pb) => {
    if (symbol && pb.symbol.toUpperCase() !== symbol.toUpperCase()) return false;
    if (timeframe && pb.timeframe !== timeframe) return false;
    if (direction && pb.direction !== direction) return false;
    return true;
  });
}

/**
 * Add a journal entry for an AI-assisted trade / idea.
 */
function addJournalEntry(entry) {
  const stored = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    ...entry,
  };
  journalEntries.push(stored);
  return stored;
}

/**
 * (Optional) Read-only access if you ever want to inspect from the UI.
 */
function getJournalEntries() {
  return journalEntries.slice().reverse();
}

module.exports = {
  getPlaybooks,
  addJournalEntry,
  getJournalEntries,
};
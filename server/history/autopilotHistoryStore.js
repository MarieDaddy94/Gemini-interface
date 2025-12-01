
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'autopilotHistory.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadHistory() {
  ensureDataDir();
  if (!fs.existsSync(HISTORY_FILE)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('[AutopilotHistory] Failed to load history:', err);
    return [];
  }
}

function saveHistory(list) {
  ensureDataDir();
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.error('[AutopilotHistory] Failed to save history:', err);
  }
}

/**
 * Append a new Autopilot history entry.
 *
 * @param {object} entryFromClient  // same shape as journal entry on frontend
 * @param {object} sessionState
 */
function appendAutopilotHistory(entryFromClient, sessionState) {
  const history = loadHistory();

  const instrument = sessionState?.instrument || {};
  const tf = sessionState?.timeframe || {};

  const now = Date.now();
  const id = `${now}-${Math.random().toString(36).slice(2, 8)}`;

  const record = {
    id,
    createdAt: now,
    // From session
    instrumentSymbol:
      entryFromClient.instrumentSymbol ||
      instrument.symbol ||
      instrument.displayName ||
      'UNKNOWN',
    timeframe: tf.currentTimeframe || null,
    environment: sessionState?.environment || 'sim',
    autopilotMode: sessionState?.autopilotMode || 'off',
    // From entry
    direction: entryFromClient.direction || 'long',
    riskPercent: entryFromClient.riskPercent ?? 0,
    allowed: entryFromClient.allowed ?? true,
    recommended: entryFromClient.recommended ?? false,
    source: entryFromClient.source || 'unknown',
    executionStatus: entryFromClient.executionStatus || 'not_executed',
    riskReasons: entryFromClient.riskReasons || [],
    riskWarnings: entryFromClient.riskWarnings || [],
    planSummary: entryFromClient.planSummary || '',
    pnl: typeof entryFromClient.pnl === 'number' ? entryFromClient.pnl : null,
  };

  history.push(record);
  saveHistory(history);

  return record;
}

/**
 * Get history filtered for "similar" context.
 * We bias on instrument / environment / autopilotMode.
 *
 * @param {object} sessionState
 * @param {number} limit
 */
function getSimilarAutopilotHistory(sessionState, limit = 30) {
  const history = loadHistory();

  const instrument = sessionState?.instrument || {};
  const tf = sessionState?.timeframe || {};

  const symbol = instrument.symbol || instrument.displayName || null;
  const environment = sessionState?.environment || null;
  const autopilotMode = sessionState?.autopilotMode || null;
  const timeframe = tf.currentTimeframe || null;

  const filtered = history.filter((h) => {
    if (symbol && h.instrumentSymbol && h.instrumentSymbol !== symbol) {
      return false;
    }
    if (environment && h.environment && h.environment !== environment) {
      return false;
    }
    if (autopilotMode && h.autopilotMode && h.autopilotMode !== autopilotMode) {
      return false;
    }
    // timeframe filter is softer – only enforce if both present
    if (timeframe && h.timeframe && h.timeframe !== timeframe) {
      return false;
    }
    return true;
  });

  filtered.sort((a, b) => b.createdAt - a.createdAt);

  return filtered.slice(0, limit);
}

/**
 * Compute simple stats for a given session context.
 *
 * @param {object} sessionState
 * @param {number} limit
 */
function getStatsForSession(sessionState, limit = 100) {
  const similar = getSimilarAutopilotHistory(sessionState, limit);
  if (!similar.length) {
    return {
      total: 0,
      closed: 0,
      wins: 0,
      losses: 0,
      breakeven: 0,
      winRate: 0,
      avgRisk: 0,
      avgPnl: 0,
      losingStreak: 0,
      recentDirectionBias: null,
      entries: similar,
    };
  }

  let closed = 0;
  let wins = 0;
  let losses = 0;
  let breakeven = 0;
  let sumRisk = 0;
  let sumPnl = 0;

  // compute last losing streak
  let losingStreak = 0;
  for (const h of similar) {
    if (h.executionStatus === 'closed' || (h.executionStatus === 'executed' && h.pnl !== null && h.pnl !== undefined)) {
      closed++;
      if (typeof h.pnl === 'number') {
        sumPnl += h.pnl;
        if (h.pnl > 0) wins++;
        else if (h.pnl < 0) losses++;
        else breakeven++;

        if (h.pnl < 0) {
          losingStreak++;
        } else if (h.pnl > 0) {
          losingStreak = 0; // reset streak on win, though loop is recent-first so we only count until a win
        }
      }
    }
    if (typeof h.riskPercent === 'number') {
      sumRisk += h.riskPercent;
    }
  }

  const total = similar.length;
  const winRate = closed > 0 ? (wins / closed) * 100 : 0;
  const avgRisk = total > 0 ? sumRisk / total : 0;
  const avgPnl = closed > 0 ? sumPnl / closed : 0;

  // rough direction bias: majority of last 10
  const recent = similar.slice(0, 10);
  let longs = 0;
  let shorts = 0;
  recent.forEach((h) => {
    if (h.direction === 'short') shorts++;
    else if (h.direction === 'long') longs++;
  });
  let recentDirectionBias = null;
  if (longs > shorts) recentDirectionBias = 'long';
  else if (shorts > longs) recentDirectionBias = 'short';

  return {
    total,
    closed,
    wins,
    losses,
    breakeven,
    winRate,
    avgRisk,
    avgPnl,
    losingStreak,
    recentDirectionBias,
    entries: similar,
  };
}

module.exports = {
  appendAutopilotHistory,
  getSimilarAutopilotHistory,
  getStatsForSession,
};

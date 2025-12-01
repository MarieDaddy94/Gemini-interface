
// server/broker/brokerStateStore.js
//
// JSON-backed broker/account snapshot store.
// Single-user for now (keyed by "default") but easily extendable to multi-user.
// This lets the AI see: balance, equity, daily PnL, and open positions.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const BROKER_FILE = path.join(DATA_DIR, 'brokerSnapshot.json');

const DEFAULT_USER_ID = 'default';

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadAllSnapshots() {
  ensureDataDir();
  if (!fs.existsSync(BROKER_FILE)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(BROKER_FILE, 'utf8');
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    console.error('[BrokerState] Failed to load brokerSnapshot.json:', err);
    return {};
  }
}

function saveAllSnapshots(map) {
  ensureDataDir();
  try {
    fs.writeFileSync(BROKER_FILE, JSON.stringify(map, null, 2), 'utf8');
  } catch (err) {
    console.error('[BrokerState] Failed to save brokerSnapshot.json:', err);
  }
}

/**
 * Normalize incoming snapshot payload into a clean object.
 *
 * Shape:
 * {
 *   accountId: string | null,
 *   broker: string | null,
 *   currency: string | null,
 *   balance: number | null,
 *   equity: number | null,
 *   freeMargin: number | null,
 *   marginUsed: number | null,
 *   dailyPnl: number | null,
 *   dailyDrawdown: number | null,
 *   openPositions: [
 *     {
 *       ticket: string,
 *       symbol: string,
 *       direction: "buy" | "sell",
 *       volume: number,
 *       entryPrice: number,
 *       stopLoss: number | null,
 *       takeProfit: number | null,
 *       unrealizedPnl: number | null,
 *       openedAt: number | null
 *     }
 *   ]
 * }
 */
function normalizeSnapshot(input) {
  const src = input || {};

  const toNum = (val) =>
    typeof val === 'number'
      ? val
      : typeof val === 'string'
      ? Number(val)
      : null;

  const snapshot = {
    accountId:
      typeof src.accountId === 'string' ? src.accountId : null,
    broker: typeof src.broker === 'string' ? src.broker : null,
    currency:
      typeof src.currency === 'string' ? src.currency : null,
    balance: toNum(src.balance),
    equity: toNum(src.equity),
    freeMargin: toNum(src.freeMargin),
    marginUsed: toNum(src.marginUsed),
    dailyPnl: toNum(src.dailyPnl),
    dailyDrawdown: toNum(src.dailyDrawdown),
    openPositions: [],
    updatedAt: Date.now(),
  };

  if (Array.isArray(src.openPositions)) {
    snapshot.openPositions = src.openPositions.map((p) => ({
      ticket:
        typeof p.ticket === 'string' ? p.ticket : '',
      symbol:
        typeof p.symbol === 'string' ? p.symbol : '',
      direction:
        p.direction === 'buy' || p.direction === 'sell'
          ? p.direction
          : '',
      volume: toNum(p.volume) || 0,
      entryPrice: toNum(p.entryPrice),
      stopLoss: toNum(p.stopLoss),
      takeProfit: toNum(p.takeProfit),
      unrealizedPnl: toNum(p.unrealizedPnl),
      openedAt:
        typeof p.openedAt === 'number'
          ? p.openedAt
          : typeof p.openedAt === 'string'
          ? Date.parse(p.openedAt) || null
          : null,
    }));
  }

  return snapshot;
}

/**
 * Store broker snapshot for a given user.
 *
 * @param {string} userId
 * @param {object} payload
 */
function setBrokerSnapshot(userId, payload) {
  const id = userId || DEFAULT_USER_ID;
  const all = loadAllSnapshots();
  const normalized = normalizeSnapshot(payload);
  all[id] = normalized;
  saveAllSnapshots(all);
  return normalized;
}

/**
 * Get broker snapshot for a given user. If none, returns a neutral snapshot.
 *
 * @param {string} userId
 */
function getBrokerSnapshot(userId) {
  const id = userId || DEFAULT_USER_ID;
  const all = loadAllSnapshots();
  const snap = all[id];
  if (snap) return snap;

  return {
    accountId: null,
    broker: null,
    currency: null,
    balance: null,
    equity: null,
    freeMargin: null,
    marginUsed: null,
    dailyPnl: null,
    dailyDrawdown: null,
    openPositions: [],
    updatedAt: null,
  };
}

/**
 * Build a compact text summary of broker state for prompts.
 *
 * @param {object} snapshot
 */
function formatBrokerSnapshotForPrompt(snapshot) {
  if (!snapshot) {
    return 'No broker/account snapshot available.';
  }

  const parts = [];
  const acct = snapshot.accountId || '(unknown account)';
  const broker = snapshot.broker || '(unknown broker)';
  const currency = snapshot.currency || '';

  const balance =
    typeof snapshot.balance === 'number'
      ? snapshot.balance.toFixed(2)
      : 'n/a';
  const equity =
    typeof snapshot.equity === 'number'
      ? snapshot.equity.toFixed(2)
      : 'n/a';
  const freeMargin =
    typeof snapshot.freeMargin === 'number'
      ? snapshot.freeMargin.toFixed(2)
      : 'n/a';
  const usedMargin =
    typeof snapshot.marginUsed === 'number'
      ? snapshot.marginUsed.toFixed(2)
      : 'n/a';
  const dailyPnl =
    typeof snapshot.dailyPnl === 'number'
      ? snapshot.dailyPnl.toFixed(2)
      : 'n/a';
  const dailyDD =
    typeof snapshot.dailyDrawdown === 'number'
      ? snapshot.dailyDrawdown.toFixed(2)
      : 'n/a';

  parts.push(
    `Account: ${acct} @ ${broker} ${currency ? `(${currency})` : ''}`,
    `Balance: ${balance}, Equity: ${equity}, FreeMargin: ${freeMargin}, MarginUsed: ${usedMargin}`,
    `Daily PnL: ${dailyPnl}, Daily Drawdown: ${dailyDD}`
  );

  if (Array.isArray(snapshot.openPositions) && snapshot.openPositions.length) {
    parts.push('', 'Open positions:');
    snapshot.openPositions.forEach((p, idx) => {
      const side =
        p.direction === 'buy'
          ? 'LONG'
          : p.direction === 'sell'
          ? 'SHORT'
          : 'UNKNOWN';
      const vol =
        typeof p.volume === 'number' ? p.volume.toFixed(2) : 'n/a';
      const ep =
        typeof p.entryPrice === 'number'
          ? p.entryPrice.toFixed(2)
          : 'n/a';
      const upnl =
        typeof p.unrealizedPnl === 'number'
          ? p.unrealizedPnl.toFixed(2)
          : 'n/a';
      const symbol = p.symbol || 'UNKNOWN';

      parts.push(
        `${idx + 1}. ${symbol} ${side} ${vol} @ ${ep}, uPnL=${upnl}, SL=${
          p.stopLoss ?? 'n/a'
        }, TP=${p.takeProfit ?? 'n/a'}`
      );
    });
  } else {
    parts.push('', 'Open positions: none.');
  }

  return parts.join('\n');
}

module.exports = {
  setBrokerSnapshot,
  getBrokerSnapshot,
  formatBrokerSnapshotForPrompt,
};

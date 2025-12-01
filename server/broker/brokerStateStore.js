
// server/broker/brokerStateStore.js

class BrokerStateStore {
  constructor() {
    this.currentSnapshot = null;
    this.lastUpdated = null;
    this.subscribers = new Set();
  }

  /**
   * Update the in-memory broker snapshot and notify listeners.
   * @param {any} snapshot
   */
  updateSnapshot(snapshot) {
    this.currentSnapshot = snapshot;
    this.lastUpdated = new Date();
    for (const fn of this.subscribers) {
      try {
        fn(snapshot);
      } catch (err) {
        console.error('[BrokerStateStore] subscriber error:', err);
      }
    }
  }

  /**
   * Get the latest snapshot (or null if not yet fetched).
   */
  getSnapshot() {
    return this.currentSnapshot;
  }

  /**
   * Subscribe to snapshot updates. Returns an unsubscribe function.
   */
  onUpdate(fn) {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }
}

const brokerStateStore = new BrokerStateStore();

// --- ADAPTERS FOR LEGACY CODE COMPATIBILITY ---

/**
 * Legacy adapter: set snapshot for a user.
 * In this version, we map it to the singleton store.
 */
function setBrokerSnapshot(userId, payload) {
  brokerStateStore.updateSnapshot(payload);
  return payload;
}

/**
 * Legacy adapter: get snapshot for a user.
 * Returns the singleton snapshot.
 */
function getBrokerSnapshot(userId) {
  return brokerStateStore.getSnapshot() || {
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
 * Updated to handle the normalized format from tradelockerClient.
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
    typeof snapshot.marginAvailable === 'number'
      ? snapshot.marginAvailable.toFixed(2)
      : typeof snapshot.freeMargin === 'number'
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
      // Handle normalized 'side' (LONG/SHORT) or raw 'direction'
      let side = 'UNKNOWN';
      if (p.side) side = p.side;
      else if (p.direction === 'buy') side = 'LONG';
      else if (p.direction === 'sell') side = 'SHORT';

      const vol = (typeof p.size === 'number' ? p.size : p.volume) || 0;
      const ep = (typeof p.entryPrice === 'number' ? p.entryPrice : 0).toFixed(2);
      
      const upnlVal = typeof p.unrealizedPnl === 'number' ? p.unrealizedPnl : 0;
      const upnl = upnlVal.toFixed(2);
      
      const symbol = p.symbol || 'UNKNOWN';
      const sl = typeof p.stopLoss === 'number' ? p.stopLoss.toFixed(2) : 'n/a';
      const tp = typeof p.takeProfit === 'number' ? p.takeProfit.toFixed(2) : 'n/a';

      parts.push(
        `${idx + 1}. ${symbol} ${side} ${vol} @ ${ep}, uPnL=${upnl}, SL=${sl}, TP=${tp}`
      );
    });
  } else {
    parts.push('', 'Open positions: none.');
  }

  return parts.join('\n');
}

module.exports = {
  brokerStateStore,
  setBrokerSnapshot,
  getBrokerSnapshot,
  formatBrokerSnapshotForPrompt
};

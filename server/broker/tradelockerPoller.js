
// server/broker/tradelockerPoller.js

const { brokerStateStore } = require('./brokerStateStore');
const { fetchTradeLockerSnapshot } = require('./tradelockerClient');

let intervalHandle = null;

/**
 * Start periodic polling of TradeLocker and stream snapshots into:
 *  - brokerStateStore (for your agents/autopilot)
 *  - Socket.io (for your front-end, if provided)
 */
function startTradeLockerPolling(io) {
  const intervalMs = Number(
    process.env.TRADELOCKER_POLL_INTERVAL_MS || 15000,
  );

  async function pollOnce() {
    try {
      // Only poll if credentials are present
      if (!process.env.TRADELOCKER_EMAIL || !process.env.TRADELOCKER_ACCOUNT_ID) {
         return;
      }
      
      const snapshot = await fetchTradeLockerSnapshot();
      brokerStateStore.updateSnapshot(snapshot);

      if (io) {
        io.emit('broker:snapshot', snapshot);
      }
    } catch (err) {
      console.error('[TradeLockerPoller] Polling error:', err.message);
    }
  }

  // Run immediately, then on a schedule
  pollOnce();

  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = setInterval(pollOnce, intervalMs);

  console.log(
    `[TradeLockerPoller] Started polling every ${intervalMs}ms.`,
  );
}

module.exports = { startTradeLockerPolling };

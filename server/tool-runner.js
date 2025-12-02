
// server/tool-runner.js
const { getPrice } = require('./marketData');
const { runDeskCoordinator } = require('./routes/deskRouter');

/**
 * Creates a runtime context object that the Unified AI Runner can use 
 * to execute tool handlers.
 * 
 * Updated to support Async DB Access (SQLite).
 */
function createRuntimeContext(db, reqContext) {
  const { brokerSessionId, journalSessionId, symbol, deskState } = reqContext || {};

  return {
    accountId: brokerSessionId, // Treat sessionId as primary account lookup for now
    symbol: symbol || "US30",

    log: (msg, data) => console.log(`[ContextLog] ${msg}`, data),

    // --- Tool Impl ---

    getBrokerState: async (accountId) => {
      const id = accountId || brokerSessionId;
      if (!id) return "No broker session connected.";
      
      const session = await db.getSession(id);
      if (!session) return "No broker session found.";
      
      // Use cached state from polling, fallback to initial account info
      const state = session.latestState || {};
      const acc = session.accounts?.[0] || {};
      
      return {
        accountId: session.accountId,
        accountName: acc.name,
        balance: state.balance ?? acc.balance, 
        equity: state.equity,
        marginUsed: state.marginUsed,
        isDemo: session.isDemo,
        server: session.server
      };
    },

    getOpenPositions: async (accountId, filterSymbol) => {
      const id = accountId || brokerSessionId;
      if (!id) return "No broker session.";
      
      const session = await db.getSession(id);
      if (!session) return "No broker session found.";

      const positions = Object.values(session.lastPositionsById || {});
      const filtered = filterSymbol 
        ? positions.filter(p => p.symbol.includes(filterSymbol)) 
        : positions;
      
      if (filtered.length === 0) return "No open positions.";
      return filtered;
    },

    executeOrder: async (args) => {
      const { symbol, side, size, stopLoss, takeProfit } = args;
      // use context brokerSessionId
      if (!brokerSessionId) return "Error: No active broker session to execute trade.";
      
      const session = await db.getSession(brokerSessionId);
      if (!session) return "Error: Session expired or invalid.";

      try {
        const entryPrice = getPrice(symbol) || 0;
        if (entryPrice === 0) return "Error: Market data unavailable for symbol.";

        const positionId = `auto-${Date.now()}`;
        const newPosition = {
          id: positionId,
          symbol,
          side,
          size: Number(size),
          entryPrice,
          currentPrice: entryPrice,
          pnl: 0,
          openTime: new Date().toISOString(),
          sl: stopLoss,
          tp: takeProfit,
          isSimulated: true // Flag as simulated/autopilot
        };

        if (!session.simulatedPositions) session.simulatedPositions = [];
        session.simulatedPositions.push(newPosition);
        
        // SAVE DB (Async)
        await db.setSession(brokerSessionId, session);

        console.log(`[Autopilot] Executed ${side} ${size} ${symbol} @ ${entryPrice}`);
        return `SUCCESS: Order executed. ID: ${positionId}. Entry: ${entryPrice}`;
      } catch (e) {
        console.error(`[Autopilot] Execution Error: ${e.message}`);
        return `Error executing order: ${e.message}`;
      }
    },

    getRecentTrades: async ({ limit }) => {
      const entries = await db.getJournal(journalSessionId);
      // Map journal entries to a "trade" like structure if they have outcomes
      const trades = entries.slice(0, limit).map(e => ({
        timestamp: e.timestamp,
        symbol: e.symbol || e.focusSymbol,
        direction: e.direction || e.bias,
        outcome: e.outcome,
        pnl: e.netPnl || e.finalPnl,
        note: e.postTradeNotes || e.note,
        tags: e.tags
      }));
      return trades;
    },

    getPlaybooks: async ({ symbol }) => {
      // Return mock playbooks or filter from a store
      return [
        { name: "Trend_Pullback_V1", symbol: symbol || "General", winRate: 0.60 },
        { name: "Breakout_Rejection", symbol: symbol || "General", winRate: 0.45 }
      ];
    },

    appendJournalEntry: async (entry) => {
      // We can push to the journal for this session
      const list = await db.getJournal(journalSessionId);
      
      const newEntry = {
        id: `ai-${Date.now()}`,
        timestamp: entry.createdAt || new Date().toISOString(),
        
        // Structured Fields
        symbol: entry.symbol,
        direction: entry.direction,
        timeframe: entry.timeframe,
        session: entry.session,
        
        size: entry.size,
        netPnl: entry.netPnl,
        rMultiple: entry.rMultiple,
        
        playbook: entry.playbook,
        preTradePlan: entry.preTradePlan,
        postTradeNotes: entry.postTradeNotes,
        sentiment: entry.sentiment,
        
        // Map Tags
        tags: Array.isArray(entry.tags) ? entry.tags : (entry.tag ? [entry.tag] : []),
        
        // Fallbacks / Legacy
        focusSymbol: entry.symbol || symbol || 'AI-Note',
        bias: entry.direction === 'long' ? 'Bullish' : entry.direction === 'short' ? 'Bearish' : 'Neutral',
        note: entry.note || entry.postTradeNotes || entry.preTradePlan || "AI Entry",
        outcome: 'Open'
      };
      
      if (journalSessionId) {
          list.unshift(newEntry);
          await db.setJournal(journalSessionId, list);
      }
      console.log(`[AI] appended structured journal entry for ${newEntry.symbol}`);
    },
    
    savePlaybookVariant: async (args) => {
        console.log("[AI] Saved playbook variant", args);
        return "Variant saved.";
    },

    deskRoundup: async (args) => {
        if (!deskState) {
            return "Error: Desk state not provided in context.";
        }
        const question = args.question || "Give a short desk status for the current goal.";
        
        // Reuse logic from desk router
        try {
            const result = await runDeskCoordinator(question, deskState);
            return {
                messageFromDesk: result.message
                // We don't apply updates here, just informative text. 
                // To apply updates, the agent should have used configure_trading_desk or frontend needs to poll.
            };
        } catch (e) {
            return `Error running desk coordinator: ${e.message}`;
        }
    }
  };
}

module.exports = { createRuntimeContext };

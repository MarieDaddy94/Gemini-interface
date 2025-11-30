
// server/tool-runner.js

/**
 * Creates a runtime context object that the Unified AI Runner can use 
 * to execute tool handlers.
 */
function createRuntimeContext(sessions, journals, reqContext) {
  const { brokerSessionId, journalSessionId, symbol } = reqContext || {};

  // Helpers to get data from memory stores
  const getSession = (id) => {
    const sid = id || brokerSessionId;
    if (!sid || !sessions.has(sid)) return null;
    return sessions.get(sid);
  };

  const getJournal = (id) => {
    const sid = id || journalSessionId;
    if (!sid) return [];
    return journals.get(sid) || [];
  };

  return {
    accountId: brokerSessionId, // Treat sessionId as primary account lookup for now
    symbol: symbol || "US30",

    log: (msg, data) => console.log(`[ContextLog] ${msg}`, data),

    // --- Tool Impl ---

    getBrokerState: async (accountId) => {
      const session = getSession(accountId);
      if (!session) return "No broker session connected.";
      
      // In a real app, query backend for fresh balance
      // We'll return the session's memory state
      return {
        accountId: session.accountId,
        accountName: session.accounts?.[0]?.name,
        balance: 10000, // Mock or fetch real
        isDemo: session.isDemo,
        server: session.server
      };
    },

    getOpenPositions: async (accountId, filterSymbol) => {
      const session = getSession(accountId);
      if (!session) return "No broker session.";
      const positions = Object.values(session.lastPositionsById || {});
      const filtered = filterSymbol 
        ? positions.filter(p => p.symbol.includes(filterSymbol)) 
        : positions;
      
      if (filtered.length === 0) return "No open positions.";
      return filtered;
    },

    getRecentTrades: async ({ limit }) => {
      const entries = getJournal(null);
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
      // We can push to the in-memory journal for this session
      const list = getJournal(null);
      
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
          // If the list exists in the map, we can update it (mutating the array ref)
          list.unshift(newEntry);
          // Also verify if we need to set it back if it was a new array
          if (!journals.has(journalSessionId)) journals.set(journalSessionId, list);
      }
      console.log(`[AI] appended structured journal entry for ${newEntry.symbol}`);
    },
    
    savePlaybookVariant: async (args) => {
        console.log("[AI] Saved playbook variant", args);
        return "Variant saved.";
    }
  };
}

module.exports = { createRuntimeContext };

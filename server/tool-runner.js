
// server/tool-runner.js
const { getPrice } = require('./marketData');
const { runDeskCoordinator } = require('./routes/deskRouter');
const { generateAutopilotPlan, reviewAutopilotPlan } = require('./services/autopilotOrchestrator');
const journalService = require('./services/journalService');
const playbookPerformanceService = require('./services/playbookPerformanceService');

/**
 * Creates a runtime context object that the Unified AI Runner can use 
 * to execute tool handlers.
 */
function createRuntimeContext(db, reqContext) {
  const { brokerSessionId, journalSessionId, symbol, deskState } = reqContext || {};

  return {
    accountId: brokerSessionId,
    symbol: symbol || "US30",
    
    // Inject services
    journalService,
    playbookPerformanceService,

    log: (msg, data) => console.log(`[ContextLog] ${msg}`, data),

    // --- Tool Impl ---

    getBrokerState: async (accountId) => {
      const id = accountId || brokerSessionId;
      if (!id) return "No broker session connected.";
      
      const session = await db.getSession(id);
      if (!session) return "No broker session found.";
      
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
          isSimulated: true
        };

        if (!session.simulatedPositions) session.simulatedPositions = [];
        session.simulatedPositions.push(newPosition);
        
        await db.setSession(brokerSessionId, session);

        console.log(`[Autopilot] Executed ${side} ${size} ${symbol} @ ${entryPrice}`);
        return `SUCCESS: Order executed. ID: ${positionId}. Entry: ${entryPrice}`;
      } catch (e) {
        console.error(`[Autopilot] Execution Error: ${e.message}`);
        return `Error executing order: ${e.message}`;
      }
    },

    getRecentTrades: async ({ limit }) => {
      const entries = await journalService.listEntries({}, journalSessionId);
      const trades = entries.slice(0, limit).map(e => ({
        timestamp: e.createdAt,
        symbol: e.symbol,
        direction: e.direction,
        outcome: e.status === 'closed' ? (e.resultPnl > 0 ? 'Win' : 'Loss') : e.status,
        pnl: e.resultPnl,
        note: e.notes,
        tags: e.tags
      }));
      return trades;
    },

    getPlaybooks: async ({ symbol }) => {
      // Return definition templates (static or DB based)
      return [
        { name: "Trend_Pullback_V1", symbol: symbol || "General" },
        { name: "Breakout_Rejection", symbol: symbol || "General" },
        { name: "NY_Liquidity_Sweep", symbol: symbol || "General" }
      ];
    },

    getPlaybookPerformance: async ({ playbookName, symbol, lookbackDays }) => {
        const profile = await playbookPerformanceService.getProfileForPlaybook(
            playbookName, 
            symbol
        );
        if (!profile) return `No data found for playbook '${playbookName}' on ${symbol}. Status: GRAY (Insufficient Data).`;
        
        return {
            playbook: profile.playbook,
            symbol: profile.symbol,
            health: profile.health.toUpperCase(),
            winRate: (profile.winRate * 100).toFixed(1) + '%',
            avgR: profile.avgR.toFixed(2),
            sampleSize: profile.sampleSize,
            lastTrade: profile.lastTradeAt
        };
    },

    listBestPlaybooks: async ({ symbol, limit, lookbackDays }) => {
        const profiles = await playbookPerformanceService.getPlaybookProfiles({
            symbol, 
            lookbackDays
        });
        
        // Return simplified list
        return profiles.slice(0, limit).map(p => ({
            name: p.playbook,
            health: p.health.toUpperCase(),
            winRate: (p.winRate * 100).toFixed(0) + '%',
            avgR: p.avgR.toFixed(2) + 'R'
        }));
    },

    // Legacy support wrapper
    appendJournalEntry: async (entry) => {
      await journalService.logEntry({
         ...entry,
         sessionId: journalSessionId
      });
      console.log(`[AI] appended structured journal entry via legacy wrapper`);
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
        
        try {
            const result = await runDeskCoordinator(question, deskState);
            return {
                messageFromDesk: result.message
            };
        } catch (e) {
            return `Error running desk coordinator: ${e.message}`;
        }
    },

    // --- Autopilot Handler ---
    runAutopilotReview: async (args) => {
      let brokerSnapshot = null;
      if (brokerSessionId) {
        const session = await db.getSession(brokerSessionId);
        if (session) {
           brokerSnapshot = {
             equity: session.latestState?.equity ?? session.accounts?.[0]?.balance ?? 0,
             dailyPnl: session.latestState?.dailyPnl ?? 0,
             openPositionsCount: Object.keys(session.lastPositionsById || {}).length
           };
        }
      }

      const generated = await generateAutopilotPlan({
        symbol: args.symbol,
        timeframe: args.timeframe,
        mode: "auto",
        question: args.notes || `Proposed by Desk Agent (${args.sidePreference || 'any'} side)`,
        brokerSnapshot,
        riskProfile: "balanced"
      });

      const sessionStateForRisk = {
        riskConfig: {
          maxRiskPerTradePercent: args.maxRiskPct || 0.5,
          maxDailyLossPercent: 3, 
          maxTradesPerDay: 5
        },
        riskRuntime: {
          tradesTakenToday: 0,
          realizedPnlTodayPercent: 0
        },
        autopilotMode: 'semi'
      };

      const review = await reviewAutopilotPlan(generated, sessionStateForRisk);
      return review;
    }
  };
}

module.exports = { createRuntimeContext };

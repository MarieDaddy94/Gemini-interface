
// server/tool-runner.js
const { getPrice } = require('./marketData');
const { runDeskCoordinator } = require('./routes/deskRouter');
const { generateAutopilotPlan, reviewAutopilotPlan } = require('./services/autopilotOrchestrator');
const journalService = require('./services/journalService');
const playbookPerformanceService = require('./services/playbookPerformanceService');
const visionService = require('./services/visionService');
const playbookService = require('./services/playbookService');
const { brokerStateStore } = require('./broker/brokerStateStore'); // NEW Import

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
    playbookService, 
    visionService,

    log: (msg, data) => console.log(`[ContextLog] ${msg}`, data),

    // --- Tool Impl ---

    getBrokerState: async (accountId) => {
      // Ignore request accountId if we have a global store for now (Single User Mode)
      // In multi-user, we would use accountId to lookup specific store.
      const snapshot = brokerStateStore.getSnapshot();
      
      if (!snapshot) return "No broker session connected/active.";
      
      return {
        accountId: snapshot.accountId,
        accountName: snapshot.broker, // Mapping mismatch fix
        balance: snapshot.balance,
        equity: snapshot.equity,
        marginUsed: snapshot.marginUsed,
        openPnl: snapshot.equity - snapshot.balance,
        openPositionsCount: snapshot.openPositions.length,
        isDemo: true // Assume demo if not in snapshot
      };
    },

    getOpenPositions: async (accountId, filterSymbol) => {
      const snapshot = brokerStateStore.getSnapshot();
      if (!snapshot) return "No broker session.";

      const positions = snapshot.openPositions || [];
      const filtered = filterSymbol 
        ? positions.filter(p => (p.symbol || '').includes(filterSymbol)) 
        : positions;
      
      if (filtered.length === 0) return "No open positions.";
      return filtered;
    },

    executeOrder: async (args) => {
      // NOTE: Tools usually shouldn't execute live orders directly without guard.
      // This tool is kept for legacy agents, but 'autopilot' is preferred.
      return "Direct execution via chat tool is disabled for safety. Use Autopilot.";
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
        tags: e.tags,
        playbook: e.playbook
      }));
      return trades;
    },

    getRecentVisionSnapshots: async (symbol, limit) => {
        return visionService.getRecent(symbol, limit);
    },

    appendJournalEntry: async (entry) => {
      await journalService.logEntry({
         ...entry,
         sessionId: journalSessionId
      });
      return { status: "ok", message: "Journal entry saved." };
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
      // Fetch fresh snapshot directly from store
      const liveSnap = brokerStateStore.getSnapshot();
      if (liveSnap) {
           brokerSnapshot = {
             equity: liveSnap.equity,
             dailyPnl: liveSnap.dailyPnl,
             openPositionsCount: liveSnap.openPositions.length
           };
      }

      // Fetch vision context to inform the plan
      const visionHistory = await visionService.getRecent(args.symbol || symbol, 2);
      const visionSummary = visionHistory.length > 0 
         ? `Recent Vision (${visionHistory[0].timeframe}): Bias=${visionHistory[0].bias}, Regime=${visionHistory[0].regime}, Summary=${visionHistory[0].textSummary}`
         : "No recent vision snapshots.";

      const generated = await generateAutopilotPlan({
        symbol: args.symbol,
        timeframe: args.timeframe,
        mode: "auto",
        question: args.notes || `Proposed by Desk Agent (${args.sidePreference || 'any'} side)`,
        brokerSnapshot,
        visionSummary,
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

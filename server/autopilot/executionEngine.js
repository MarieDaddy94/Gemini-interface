
// server/autopilot/executionEngine.js
//
// Autopilot execution engine.
// Routes commands to either Real Broker (TradeLocker) or Sim Broker based on environment.

const { brokerStateStore } = require('../broker/brokerStateStore');
const { evaluateTradeCommand } = require('./executionGuard');
const {
  placeOrder,
  closePosition,
  modifyPosition,
} = require('../broker/tradelockerClient');
const simBroker = require('../broker/simBroker');
const sessionSummaryService = require('../services/sessionSummaryService');

const ALLOW_AUTO_EXECUTE =
  String(process.env.AUTOPILOT_ALLOW_AUTO_EXECUTE || 'false').toLowerCase() ===
  'true';

/**
 * Execute (or propose) a trade command depending on mode.
 * options: { mode: 'auto'|'confirm', command, source, environment: 'sim'|'live' }
 */
async function executeTradeCommand(options) {
  const { mode, command, source, environment } = options || {};

  // LAYER: Global Safety Net (Kill Switch Check)
  const sessionState = await sessionSummaryService.getCurrentSessionState();
  if (sessionState.tradingHalted) {
    return {
      mode: mode || 'confirm',
      source: source || 'unknown',
      executed: false,
      requiresConfirmation: false,
      allowedByGuard: false,
      hardBlocked: true,
      reasons: ['GLOBAL_KILL_SWITCH_ACTIVE'],
      warnings: ['Trading is currently halted by the desk.'],
      guardMetrics: {},
      brokerSnapshot: null,
      brokerResult: null,
    };
  }

  // Determine which state to check against
  // If SIM, we check against SimBroker state. If LIVE, we check against Real Broker state.
  const isSim = environment === 'sim' || sessionState.executionMode === 'sim';
  
  let snapshot;
  if (isSim) {
      const acct = simBroker.getSimAccount();
      const pos = simBroker.getSimPositions();
      snapshot = {
          equity: acct.equity,
          balance: acct.balance,
          dailyPnl: 0, // Sim doesn't track daily reset yet, assume 0 or calc from history
          openPositions: pos.map(p => ({
              id: p.id,
              symbol: p.instrumentSymbol,
              side: p.direction === 'long' ? 'LONG' : 'SHORT',
              size: p.sizeUnits,
              entryPrice: p.entryPrice,
              stopLoss: p.stopPrice,
              unrealizedPnl: p.pnl || 0
          }))
      };
  } else {
      snapshot = brokerStateStore.getSnapshot() || null;
  }

  const guard = evaluateTradeCommand(snapshot, command);

  const baseResult = {
    mode: mode || 'confirm',
    source: source || 'unknown',
    executed: false,
    requiresConfirmation: false,
    allowedByGuard: guard.allowed,
    hardBlocked: guard.hardBlocked,
    reasons: guard.reasons,
    warnings: guard.warnings,
    guardMetrics: guard.metrics,
    brokerSnapshot: snapshot,
    brokerResult: null,
  };

  // If guard says "hard blocked", we stop here.
  if (!guard.allowed && guard.hardBlocked) {
    return { ...baseResult, executed: false };
  }

  // If mode === "confirm", we *never* execute.
  if (mode === 'confirm') {
    return {
      ...baseResult,
      requiresConfirmation: !guard.allowed,
      executed: false,
    };
  }

  // mode === "auto"
  if (!ALLOW_AUTO_EXECUTE && !isSim) {
    return {
      ...baseResult,
      requiresConfirmation: true,
      executed: false,
      reasons: [...baseResult.reasons, 'AutoExecuteDisabledEnvVar'],
    };
  }

  // Guard thinks it's not OK → we still don't execute.
  if (!guard.allowed) {
    return {
      ...baseResult,
      requiresConfirmation: true,
      executed: false,
    };
  }

  // EXECUTION ROUTING
  let brokerResult = null;

  try {
      if (isSim) {
          // --- SIMULATED EXECUTION ---
          switch (command.type) {
            case 'open':
                brokerResult = simBroker.openSimPosition({
                    instrumentSymbol: command.symbol,
                    direction: String(command.side).toLowerCase() === 'buy' ? 'long' : 'short',
                    riskPercent: 1, // Defaulting as command qty is units, logic inside simBroker handles mapping
                    entryPrice: command.price, // Market order sim uses current or passed price
                    stopPrice: command.slPrice
                });
                break;
            case 'close':
                // Sim broker needs close price
                brokerResult = simBroker.closeSimPosition(command.positionId, command.price || 0);
                break;
            case 'modify':
                // Sim broker doesn't support modify yet, mock success
                brokerResult = { status: 'sim_modified', ...command };
                break;
          }
      } else {
          // --- LIVE EXECUTION (TradeLocker) ---
          switch (command.type) {
            case 'open': {
              if (String(command.side).toUpperCase() === 'BOTH') {
                 const buyPromise = placeOrder({
                    tradableInstrumentId: command.tradableInstrumentId,
                    qty: command.qty,
                    side: 'BUY',
                    type: command.entryType,
                    validity: 'IOC',
                    price: command.price,
                    stopPrice: command.stopPrice,
                    slPrice: command.slPrice,
                    tpPrice: command.tpPrice,
                    routeId: command.routeId,
                    clientOrderId: command.clientOrderId ? `${command.clientOrderId}-B` : undefined,
                 });
                 const sellPromise = placeOrder({
                    tradableInstrumentId: command.tradableInstrumentId,
                    qty: command.qty,
                    side: 'SELL',
                    type: command.entryType,
                    validity: 'IOC',
                    price: command.price,
                    stopPrice: command.stopPrice,
                    slPrice: command.slPrice,
                    tpPrice: command.tpPrice,
                    routeId: command.routeId,
                    clientOrderId: command.clientOrderId ? `${command.clientOrderId}-S` : undefined,
                 });
                 const [r1, r2] = await Promise.all([buyPromise, sellPromise]);
                 brokerResult = { buy: r1, sell: r2, note: "Executed Dual-Sided (BOTH)" };
              } else {
                 brokerResult = await placeOrder({
                    tradableInstrumentId: command.tradableInstrumentId,
                    qty: command.qty,
                    side: command.side,
                    type: command.entryType,
                    validity: 'IOC',
                    price: command.price,
                    stopPrice: command.stopPrice,
                    slPrice: command.slPrice,
                    tpPrice: command.tpPrice,
                    routeId: command.routeId,
                    clientOrderId: command.clientOrderId,
                 });
              }
              break;
            }
            case 'close':
              brokerResult = await closePosition(command.positionId, command.qty ?? 0);
              break;
            case 'modify':
              brokerResult = await modifyPosition(command.positionId, {
                slPrice: command.slPrice,
                tpPrice: command.tpPrice,
              });
              break;
            default:
              throw new Error(`Unknown command.type "${command.type}"`);
          }
      }
  } catch (err) {
      console.error("Execution failed:", err);
      return {
          ...baseResult,
          executed: false,
          reasons: [...baseResult.reasons, `ExecutionError: ${err.message}`]
      };
  }

  return {
    ...baseResult,
    executed: true,
    requiresConfirmation: false,
    brokerResult,
  };
}

module.exports = { executeTradeCommand };

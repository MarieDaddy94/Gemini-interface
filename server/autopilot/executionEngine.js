// server/autopilot/executionEngine.js
//
// Autopilot execution engine.
//
// Single entrypoint: executeTradeCommand({ mode, command, source })
// - mode: "confirm" | "auto"
// - command: { type: "open"|"close"|"modify", ... }
// - source: where this came from (e.g. "roundtable", "signal-bot", "manual")
//
// Uses:
// - brokerStateStore: to read latest snapshot
// - executionGuard: to enforce risk rules
// - tradelockerClient: to actually place/modify/close trades

const { brokerStateStore } = require('../broker/brokerStateStore');
const { evaluateTradeCommand } = require('./executionGuard');
const {
  placeOrder,
  closePosition,
  modifyPosition,
} = require('../broker/tradelockerClient');

const ALLOW_AUTO_EXECUTE =
  String(process.env.AUTOPILOT_ALLOW_AUTO_EXECUTE || 'false').toLowerCase() ===
  'true';

/**
 * @typedef {"open"|"close"|"modify"} CommandType
 *
 * @typedef {Object} OpenCommand
 * @property {"open"} type
 * @property {number} tradableInstrumentId
 * @property {string} [symbol]
 * @property {"BUY"|"SELL"} side
 * @property {number} qty
 * @property {"market"|"limit"|"stop"} entryType
 * @property {number} [price]
 * @property {number} [stopPrice]
 * @property {number} [slPrice]
 * @property {number} [tpPrice]
 * @property {number|string} [routeId]
 * @property {string} [clientOrderId]
 *
 * @typedef {Object} CloseCommand
 * @property {"close"} type
 * @property {string|number} positionId
 * @property {number} [qty]  // 0 or omitted → close full
 *
 * @typedef {Object} ModifyCommand
 * @property {"modify"} type
 * @property {string|number} positionId
 * @property {number|null} [slPrice]
 * @property {number|null} [tpPrice]
 */

/**
 * @typedef {Object} ExecuteOptions
 * @property {"confirm"|"auto"} mode
 * @property {OpenCommand|CloseCommand|ModifyCommand} command
 * @property {string} [source]
 */

/**
 * Execute (or propose) a trade command depending on mode.
 *
 * Returns a structured result:
 * {
 *   mode,
 *   executed: boolean,
 *   requiresConfirmation: boolean,
 *   allowedByGuard: boolean,
 *   reasons: string[],
 *   warnings: string[],
 *   guardMetrics: object,
 *   brokerSnapshot: object | null,
 *   brokerResult: any | null
 * }
 *
 * No matter what, you always get a full explanation.
 */
async function executeTradeCommand(options) {
  const { mode, command, source } = options || {};

  const snapshot = brokerStateStore.getSnapshot() || null;

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
    return {
      ...baseResult,
      requiresConfirmation: false,
      executed: false,
    };
  }

  // If mode === "confirm", we *never* touch TradeLocker.
  if (mode === 'confirm') {
    return {
      ...baseResult,
      requiresConfirmation: !guard.allowed,
      executed: false,
    };
  }

  // mode === "auto"
  if (!ALLOW_AUTO_EXECUTE) {
    // Autopilot is not allowed to auto-execute at all.
    return {
      ...baseResult,
      requiresConfirmation: true,
      executed: false,
      reasons: [
        ...baseResult.reasons,
        'AutoExecuteDisabled (set AUTOPILOT_ALLOW_AUTO_EXECUTE=true to enable)',
      ],
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

  // At this point: mode="auto", guard allowed, auto execute enabled.
  let brokerResult = null;

  switch (command.type) {
    case 'open': {
      brokerResult = await placeOrder({
        tradableInstrumentId: command.tradableInstrumentId,
        qty: command.qty,
        side: command.side,
        type: command.entryType,
        validity: 'IOC', // you can expose GTC/IOC later
        price: command.price,
        stopPrice: command.stopPrice,
        slPrice: command.slPrice,
        tpPrice: command.tpPrice,
        routeId: command.routeId,
        clientOrderId: command.clientOrderId,
      });
      break;
    }

    case 'close': {
      brokerResult = await closePosition(
        command.positionId,
        command.qty ?? 0,
      );
      break;
    }

    case 'modify': {
      brokerResult = await modifyPosition(command.positionId, {
        slPrice: command.slPrice,
        tpPrice: command.tpPrice,
      });
      break;
    }

    default:
      throw new Error(`Unknown command.type "${command.type}" in executeTradeCommand.`);
  }

  return {
    ...baseResult,
    executed: true,
    requiresConfirmation: false,
    brokerResult,
  };
}

module.exports = {
  executeTradeCommand,
};
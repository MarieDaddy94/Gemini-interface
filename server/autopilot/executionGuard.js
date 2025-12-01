
// server/autopilot/executionGuard.js
//
// Central risk/guardrail logic for Autopilot.
// Given a broker snapshot + a trade command, decides:
//  - allowed / blocked
//  - reasons & warnings
//  - computed risk metrics
//
// This is where you encode "prop firm rules":
//  - max daily DD
//  - max open positions
//  - max per-symbol positions
//  - max risk per trade (% equity)
//
// You can tune the thresholds via env vars.

function getEnvNumber(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// Defaults; override with env vars if you want.
const MAX_DAILY_DD_PERCENT = getEnvNumber('AUTOPILOT_MAX_DAILY_DD_PERCENT', 4);     // e.g. -4% cap
const MAX_OPEN_POSITIONS = getEnvNumber('AUTOPILOT_MAX_OPEN_POSITIONS', 5);
const MAX_POSITIONS_PER_SYMBOL = getEnvNumber('AUTOPILOT_MAX_POSITIONS_PER_SYMBOL', 3);
const MAX_SINGLE_TRADE_RISK_PERCENT = getEnvNumber('AUTOPILOT_MAX_SINGLE_TRADE_RISK_PERCENT', 1); // 1% default

/**
 * Given a broker snapshot, approximate risk for an "open" command.
 * This is very rough: |entry - SL| * qty in account currency.
 *
 * @param {object} snapshot
 * @param {object} command
 */
function computeOpenRisk(snapshot, command) {
  const equity = typeof snapshot?.equity === 'number' ? snapshot.equity : null;
  if (!equity || equity <= 0) {
    return {
      riskValue: null,
      riskPercent: null,
      reason: 'MissingOrInvalidEquity',
    };
  }

  const { slPrice, price, side, qty } = command;

  const size = Number(qty);
  if (!size || size <= 0) {
    return {
      riskValue: null,
      riskPercent: null,
      reason: 'MissingOrInvalidSize',
    };
  }

  // For market orders we assume price is near current price; front-end should pass something sensible.
  const entry = typeof price === 'number' ? price : null;
  if (!entry || !slPrice || typeof slPrice !== 'number') {
    return {
      riskValue: null,
      riskPercent: null,
      reason: 'MissingEntryOrStopLoss',
    };
  }

  // Handle BOTH side (Buy + Sell)
  if (String(side).toUpperCase() === 'BOTH') {
    // Risk is effectively sum of Buy Risk + Sell Risk.
    // However, usually a single SL price can only protect one direction properly (e.g. SL < Entry protects Buy).
    // If user provided one SL price for BOTH, it's likely invalid for one leg unless they meant hedge mode with separate logic.
    // We will calculate risk for valid legs only.
    
    let buyRisk = 0;
    let sellRisk = 0;
    
    // Check Buy Leg: SL < Entry
    if (slPrice < entry) {
       buyRisk = (entry - slPrice) * size;
    }
    
    // Check Sell Leg: SL > Entry
    if (slPrice > entry) {
       sellRisk = (slPrice - entry) * size;
    }
    
    const totalRiskValue = buyRisk + sellRisk;
    
    if (totalRiskValue <= 0) {
       return {
         riskValue: null,
         riskPercent: null,
         reason: 'StopLossNotProtectiveForEitherLeg',
       };
    }
    
    const riskPercent = (totalRiskValue / equity) * 100;
    return {
      riskValue: totalRiskValue,
      riskPercent,
      reason: null
    };
  }

  // Normal Single Side
  const distance =
    String(side).toUpperCase() === 'BUY'
      ? entry - slPrice
      : slPrice - entry;

  // If SL is "wrong side" of price, treat as no risk computed.
  if (distance <= 0) {
    return {
      riskValue: null,
      riskPercent: null,
      reason: 'StopLossNotProtective',
    };
  }

  const riskValue = distance * size;
  const riskPercent = (riskValue / equity) * 100;

  return {
    riskValue,
    riskPercent,
    reason: null,
  };
}

/**
 * Evaluate an "open" command.
 */
function evaluateOpenCommand(snapshot, command) {
  const reasons = [];
  const warnings = [];

  const equity = typeof snapshot?.equity === 'number' ? snapshot.equity : null;
  const balance = typeof snapshot?.balance === 'number' ? snapshot.balance : null;
  const dailyPnl = typeof snapshot?.dailyPnl === 'number' ? snapshot.dailyPnl : 0;
  const openPositions = Array.isArray(snapshot?.openPositions)
    ? snapshot.openPositions
    : [];

  const base = {
    allowed: true,
    hardBlocked: false,
    reasons,
    warnings,
    metrics: {
      equity,
      balance,
      dailyPnl,
      dailyDrawdownPercent: null,
      openPositionsCount: openPositions.length,
      sameSymbolOpenPositions: 0,
      estimatedRiskValue: null,
      estimatedRiskPercent: null,
    },
  };

  if (!equity || equity <= 0) {
    base.allowed = false;
    base.hardBlocked = true;
    reasons.push('InvalidEquity');
    return base;
  }

  // Daily DD % (approx) = dailyPnL / balance * 100 (negative when in drawdown)
  let dailyDDPercent = null;
  if (balance && balance > 0) {
    dailyDDPercent = (dailyPnl / balance) * 100;
  }
  base.metrics.dailyDrawdownPercent = dailyDDPercent;

  // Cap daily DD
  if (dailyDDPercent !== null && dailyDDPercent <= -Math.abs(MAX_DAILY_DD_PERCENT)) {
    base.allowed = false;
    base.hardBlocked = true;
    reasons.push(
      `DailyDrawdownLimitExceeded (dd=${dailyDDPercent.toFixed(
        2,
      )}%, limit=${-Math.abs(MAX_DAILY_DD_PERCENT)}%)`,
    );
  }

  // Max open positions (Account for BOTH creating 2 positions)
  const newPositionsCount = String(command.side).toUpperCase() === 'BOTH' ? 2 : 1;
  
  if (openPositions.length + newPositionsCount > MAX_OPEN_POSITIONS) {
    base.allowed = false;
    reasons.push(
      `MaxOpenPositionsExceeded (open=${openPositions.length}, new=${newPositionsCount}, max=${MAX_OPEN_POSITIONS})`,
    );
  }

  // Per-symbol cap
  const symbol = command.symbol || command.instrumentSymbol || null;
  if (symbol) {
    const sameSymbol = openPositions.filter(
      (p) => p.symbol === symbol || p.raw?.symbol === symbol,
    );
    base.metrics.sameSymbolOpenPositions = sameSymbol.length;

    if (sameSymbol.length + newPositionsCount > MAX_POSITIONS_PER_SYMBOL) {
      base.allowed = false;
      reasons.push(
        `MaxPositionsPerSymbolExceeded (symbol=${symbol}, open=${sameSymbol.length}, new=${newPositionsCount}, max=${MAX_POSITIONS_PER_SYMBOL})`,
      );
    }
  }

  // Risk % for this trade (if we can compute it)
  const risk = computeOpenRisk(snapshot, command);
  base.metrics.estimatedRiskValue = risk.riskValue;
  base.metrics.estimatedRiskPercent = risk.riskPercent;

  if (!risk.reason && risk.riskPercent !== null) {
    if (risk.riskPercent > MAX_SINGLE_TRADE_RISK_PERCENT) {
      base.allowed = false;
      reasons.push(
        `SingleTradeRiskTooHigh (${risk.riskPercent.toFixed(
          2,
        )}% > ${MAX_SINGLE_TRADE_RISK_PERCENT}%)`,
      );
    } else if (risk.riskPercent > MAX_SINGLE_TRADE_RISK_PERCENT * 0.75) {
      warnings.push(
        `HighSingleTradeRisk (${risk.riskPercent.toFixed(
          2,
        )}% of equity, cap=${MAX_SINGLE_TRADE_RISK_PERCENT}%)`,
      );
    }
  } else if (risk.reason) {
    warnings.push(`CouldNotEstimateRisk (${risk.reason})`);
  }

  return base;
}

/**
 * Evaluate a "close" command.
 */
function evaluateCloseCommand(snapshot, command) {
  const reasons = [];
  const warnings = [];

  const openPositions = Array.isArray(snapshot?.openPositions)
    ? snapshot.openPositions
    : [];

  const position = openPositions.find(
    (p) => String(p.id) === String(command.positionId),
  );

  const base = {
    allowed: true,
    hardBlocked: false,
    reasons,
    warnings,
    metrics: {
      closingSize: command.qty ?? null,
      positionFound: !!position,
    },
  };

  if (!position) {
    warnings.push('PositionNotFoundInSnapshot; still attempting close.');
  }

  // Generally closing risk is good; we basically always allow.
  return base;
}

/**
 * Evaluate a "modify" command (SL/TP).
 */
function evaluateModifyCommand(snapshot, command) {
  const reasons = [];
  const warnings = [];

  const openPositions = Array.isArray(snapshot?.openPositions)
    ? snapshot.openPositions
    : [];

  const position = openPositions.find(
    (p) => String(p.id) === String(command.positionId),
  );

  const base = {
    allowed: true,
    hardBlocked: false,
    reasons,
    warnings,
    metrics: {
      positionFound: !!position,
    },
  };

  if (!position) {
    warnings.push('PositionNotFoundInSnapshot; still attempting modify.');
    return base;
  }

  const entry = position.entryPrice || position.raw?.avgOpenPrice;
  const slCurrent = position.stopLoss || position.raw?.slPrice;

  // Very simple rule: disallow moving SL *further* away from entry (increasing risk).
  if (
    entry &&
    slCurrent &&
    command.slPrice !== undefined &&
    command.slPrice !== null
  ) {
    const side =
      String(position.side).toUpperCase() ||
      String(position.raw?.side || '').toUpperCase();

    if (side === 'LONG') {
      if (command.slPrice < slCurrent) {
        // tightening SL → ok
      } else if (command.slPrice > slCurrent) {
        reasons.push('CannotWidenStopLossForLong');
        base.allowed = false;
      }
    } else if (side === 'SELL') {
      if (command.slPrice > slCurrent) {
        // tightening SL → ok
      } else if (command.slPrice < slCurrent) {
        reasons.push('CannotWidenStopLossForShort');
        base.allowed = false;
      }
    }
  }

  return base;
}

/**
 * Top-level evaluation entrypoint.
 *
 * @param {object} snapshot
 * @param {object} command
 * @returns {{allowed:boolean, hardBlocked:boolean, reasons:string[], warnings:string[], metrics:object}}
 */
function evaluateTradeCommand(snapshot, command) {
  if (!snapshot) {
    return {
      allowed: false,
      hardBlocked: true,
      reasons: ['NoBrokerSnapshot'],
      warnings: [],
      metrics: {},
    };
  }

  if (!command || !command.type) {
    return {
      allowed: false,
      hardBlocked: true,
      reasons: ['MissingCommandType'],
      warnings: [],
      metrics: {},
    };
  }

  switch (command.type) {
    case 'open':
      return evaluateOpenCommand(snapshot, command);
    case 'close':
      return evaluateCloseCommand(snapshot, command);
    case 'modify':
      return evaluateModifyCommand(snapshot, command);
    default:
      return {
        allowed: false,
        hardBlocked: true,
        reasons: [`UnknownCommandType (${command.type})`],
        warnings: [],
        metrics: {},
      };
  }
}

module.exports = {
  evaluateTradeCommand,
  computeOpenRisk,
};

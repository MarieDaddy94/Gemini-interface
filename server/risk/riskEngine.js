
// server/risk/riskEngine.js
//
// Core risk evaluation logic for proposed trades.

const DEFAULT_RISK_CONFIG = {
  maxRiskPerTradePercent: 0.5,
  maxDailyLossPercent: 3,
  maxWeeklyLossPercent: 8,
  maxTradesPerDay: 5,
};

/**
 * Evaluate a proposed trade against the current risk configuration & runtime state.
 * Updated to respect optional DeskPolicy.
 *
 * @param {import('../types').TradingSessionState | any} sessionState
 * @param {{ riskPercent: number, comment?: string, playbook?: string }} proposedTrade
 * @param {object} [deskPolicy] - Optional policy object
 * @returns {import('../types').RiskCheckResult}
 */
function evaluateProposedTrade(sessionState, proposedTrade, deskPolicy) {
  const riskConfig = {
    ...(DEFAULT_RISK_CONFIG),
    ...(sessionState?.riskConfig || {}),
  };

  const riskRuntime = sessionState?.riskRuntime || {
    tradesTakenToday: 0,
    realizedPnlTodayPercent: 0,
    realizedPnlWeekPercent: 0,
  };

  const autopilotMode = sessionState?.autopilotMode || 'off';
  const environment = sessionState?.environment || 'sim';
  const autopilotConfig = sessionState?.autopilotConfig || {
    allowFullAutoInLive: false,
    requireVoiceConfirmForFullAuto: true,
  };

  const reasons = [];
  const warnings = [];

  const tradeRiskPercent = Number(proposedTrade?.riskPercent || 0);

  if (!tradeRiskPercent || tradeRiskPercent <= 0) {
    reasons.push('Proposed trade has no valid riskPercent > 0.');
  }

  // --- DESK POLICY OVERRIDES ---
  if (deskPolicy) {
      // 1. Check Max Risk Per Trade override
      if (typeof deskPolicy.maxRiskPerTrade === 'number') {
          if (tradeRiskPercent > deskPolicy.maxRiskPerTrade) {
              const msg = `Trade risk (${tradeRiskPercent}%) exceeds POLICY limit (${deskPolicy.maxRiskPerTrade}%).`;
              if (deskPolicy.mode === 'enforced') reasons.push(msg);
              else warnings.push(msg);
          }
      }

      // 2. Check Allowed Playbooks
      if (Array.isArray(deskPolicy.allowedPlaybooks) && deskPolicy.allowedPlaybooks.length > 0) {
          const pb = proposedTrade.playbook || proposedTrade.comment; // Fallback to comment if playbook missing
          // Simple string match or wildcard
          const allowed = deskPolicy.allowedPlaybooks.includes("*") || 
                          deskPolicy.allowedPlaybooks.some(p => pb && pb.toLowerCase().includes(p.toLowerCase()));
          
          if (!allowed) {
              const msg = `Playbook '${pb}' is not in today's allowed list: [${deskPolicy.allowedPlaybooks.join(', ')}]`;
              if (deskPolicy.mode === 'enforced') reasons.push(msg);
              else warnings.push(msg);
          }
      }
  }

  // Standard checks (if not already blocked by policy)
  if (tradeRiskPercent > riskConfig.maxRiskPerTradePercent) {
    reasons.push(
      `Trade risk (${tradeRiskPercent.toFixed(
        2
      )}%) exceeds max per-trade risk (${riskConfig.maxRiskPerTradePercent.toFixed(
        2
      )}%).`
    );
  } else if (tradeRiskPercent > riskConfig.maxRiskPerTradePercent * 0.7) {
    warnings.push(
      `Trade risk (${tradeRiskPercent.toFixed(
        2
      )}%) is close to your max per-trade risk (${riskConfig.maxRiskPerTradePercent.toFixed(
        2
      )}%).`
    );
  }

  const realizedToday = Number(riskRuntime.realizedPnlTodayPercent || 0);
  const realizedWeek = Number(riskRuntime.realizedPnlWeekPercent || 0);

  const projectedDailyLossPercent =
    Math.max(0, -realizedToday) + tradeRiskPercent;
  const projectedWeeklyLossPercent =
    Math.max(0, -realizedWeek) + tradeRiskPercent;

  if (projectedDailyLossPercent > riskConfig.maxDailyLossPercent) {
    reasons.push(
      `This trade could push your daily loss beyond the daily cap (${riskConfig.maxDailyLossPercent.toFixed(
        2
      )}%).`
    );
  } 

  if (projectedWeeklyLossPercent > riskConfig.maxWeeklyLossPercent) {
    reasons.push(
      `This trade could push your weekly loss beyond the weekly cap (${riskConfig.maxWeeklyLossPercent.toFixed(
        2
      )}%).`
    );
  }

  const tradesTakenToday = Number(riskRuntime.tradesTakenToday || 0);
  if (tradesTakenToday + 1 > riskConfig.maxTradesPerDay) {
    reasons.push(
      `Max trades per day reached (${riskConfig.maxTradesPerDay}).`
    );
  }

  if (environment === 'live' && autopilotMode === 'full') {
    if (!autopilotConfig.allowFullAutoInLive) {
      reasons.push(
        'Full Autopilot is disabled for live/funded accounts in your configuration.'
      );
    }
  }

  const allowed = reasons.length === 0;

  return {
    allowed,
    reasons,
    warnings,
    projectedDailyLossPercent,
    projectedWeeklyLossPercent,
  };
}

/**
 * Calculate concrete trade parameters (sizing, levels) from a high-level proposal.
 * Migrated from legacy toolsData.js.
 * 
 * @param {object} input - { symbol, timeframe, direction, accountEquity, riskPercent, entryPrice, stopLossPrice, rMultipleTarget, mode, notes, visionSummary }
 */
function calculateTradeParameters(input) {
  const symbol = input.symbol || null;
  const timeframe = input.timeframe || null;
  const direction = input.direction || null;
  const mode = input.mode || "confirm";

  const accountEquity = Number(input.accountEquity) || 0;

  // riskPercent is in PERCENT (e.g. 0.5 = 0.5%).
  let riskPercent =
    input.riskPercent !== undefined && input.riskPercent !== null
      ? Number(input.riskPercent)
      : 0.5; // default 0.5%

  if (!isFinite(riskPercent) || riskPercent < 0) riskPercent = 0;
  if (riskPercent > 5) riskPercent = 5; // Hard Cap for safety

  const entryPrice =
    input.entryPrice !== undefined && input.entryPrice !== null
      ? Number(input.entryPrice)
      : null;
  const stopLossPrice =
    input.stopLossPrice !== undefined && input.stopLossPrice !== null
      ? Number(input.stopLossPrice)
      : null;

  const rMultipleTarget =
    input.rMultipleTarget !== undefined && input.rMultipleTarget !== null
      ? Number(input.rMultipleTarget)
      : 3; // default 3R

  const visionSummary = input.visionSummary || "";
  const notes = input.notes || "";

  // Hardcoded safety defaults for the calculation engine
  const maxRiskPercentPerTrade = 2.0; 
  const minEquityForTrading = 100;

  const riskAmount = accountEquity * (riskPercent / 100);

  let distance = null;
  let positionSizeUnits = null;
  let takeProfitPrice = null;

  if (entryPrice !== null && stopLossPrice !== null) {
    distance = Math.abs(entryPrice - stopLossPrice);
    
    // Protect against zero division or infinitesimal stops
    if (distance > 0.000001 && riskAmount > 0) {
      positionSizeUnits = riskAmount / distance;

      const tpDistance = distance * rMultipleTarget;
      if (direction === "long") {
        takeProfitPrice = entryPrice + tpDistance;
      } else if (direction === "short") {
        takeProfitPrice = entryPrice - tpDistance;
      }
    }
  }

  const riskFlags = [];
  if (accountEquity < minEquityForTrading) {
    riskFlags.push("equity_too_low");
  }
  if (riskPercent > maxRiskPercentPerTrade) {
    riskFlags.push("risk_percent_above_recommended");
  }
  if (!entryPrice || !stopLossPrice) {
    riskFlags.push("missing_entry_or_stop");
  }
  if (distance !== null && distance <= 0) {
    riskFlags.push("zero_or_invalid_distance");
  }

  // Determine engine status
  const status = riskFlags.length ? "review" : "ok";

  return {
    symbol,
    timeframe,
    direction,
    mode,
    accountEquity,
    riskPercent,
    riskAmount,
    entryPrice,
    stopLossPrice,
    takeProfitPrice,
    rMultipleTarget,
    positionSizeUnits,
    visionSummary,
    notes,
    riskEngine: {
      status, 
      recommendedMaxRiskPercent: maxRiskPercentPerTrade,
      minEquityForTrading,
      flags: riskFlags,
    },
  };
}

module.exports = {
  evaluateProposedTrade,
  calculateTradeParameters
};

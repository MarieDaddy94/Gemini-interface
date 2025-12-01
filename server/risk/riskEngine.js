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
 *
 * @param {import('../types').TradingSessionState | any} sessionState
 * @param {{ riskPercent: number, comment?: string }} proposedTrade
 * @returns {import('../types').RiskCheckResult}
 */
function evaluateProposedTrade(sessionState, proposedTrade) {
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
  } else if (
    projectedDailyLossPercent >
    riskConfig.maxDailyLossPercent * 0.7
  ) {
    warnings.push(
      `This trade could bring you close to your daily loss cap (${riskConfig.maxDailyLossPercent.toFixed(
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
  } else if (
    projectedWeeklyLossPercent >
    riskConfig.maxWeeklyLossPercent * 0.7
  ) {
    warnings.push(
      `This trade could bring you close to your weekly loss cap (${riskConfig.maxWeeklyLossPercent.toFixed(
        2
      )}%).`
    );
  }

  const tradesTakenToday = Number(riskRuntime.tradesTakenToday || 0);
  if (tradesTakenToday + 1 > riskConfig.maxTradesPerDay) {
    reasons.push(
      `Max trades per day reached (${riskConfig.maxTradesPerDay}). This would be trade #${
        tradesTakenToday + 1
      }.`
    );
  } else if (tradesTakenToday + 1 === riskConfig.maxTradesPerDay) {
    warnings.push(
      `This would be your last allowed trade for today (trade #${
        tradesTakenToday + 1
      } of ${riskConfig.maxTradesPerDay}).`
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

module.exports = {
  evaluateProposedTrade,
};

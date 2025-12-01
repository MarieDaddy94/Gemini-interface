
// server/autopilot/simExecutor.js
//
// Uses the Autopilot Execution Planner + simBroker to actually open a sim trade
// when plan.allowed && plan.recommended and execution conditions are met.

const { handleAutopilotExecutionPlan: planAutopilotTrade } = require('../risk/autopilotController');
const {
  getSimAccount,
  getSimPositions,
  openSimPosition,
  closeSimPosition,
} = require('../broker/simBroker');

/**
 * Execute an Autopilot trade in the simulated broker.
 *
 * @param {any} sessionState
 * @param {{direction: 'long'|'short', riskPercent: number, notes?: string}} tradeRequest
 * @param {{ entryPrice: number, stopPrice?: number, executeIfRecommended?: boolean }} executionParams
 */
async function executeAutopilotTradeSim(
  sessionState,
  tradeRequest,
  executionParams
) {
  const { entryPrice, stopPrice, executeIfRecommended = true } =
    executionParams || {};

  const plan = await planAutopilotTrade(sessionState, tradeRequest);

  const env = sessionState?.environment || 'sim';
  const mode = sessionState?.autopilotMode || 'off';

  const canAuto =
    env === 'sim' && (mode === 'semi' || mode === 'full') && executeIfRecommended;

  let executedPosition = null;

  if (plan.allowed && plan.recommended && canAuto) {
    if (!entryPrice || typeof entryPrice !== 'number') {
      throw new Error(
        'entryPrice must be provided as a number to execute Autopilot trade in sim.'
      );
    }

    executedPosition = openSimPosition({
      instrumentSymbol:
        sessionState?.instrument?.symbol ||
        sessionState?.instrument?.displayName ||
        'UNKNOWN',
      direction: tradeRequest.direction,
      riskPercent: tradeRequest.riskPercent,
      entryPrice,
      stopPrice,
    });
  }

  return {
    plan,
    executed: !!executedPosition,
    position: executedPosition,
    account: getSimAccount(),
  };
}

module.exports = {
  executeAutopilotTradeSim,
  getSimAccount,
  getSimPositions,
  closeSimPosition,
};

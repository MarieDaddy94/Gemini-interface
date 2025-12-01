// server/risk/autopilotController.js
//
// High-level autopilot control that wraps the risk engine.
// Later this will also handle mode-specific logic (advisor, semi, full).

const { evaluateProposedTrade } = require('./riskEngine');

/**
 * Handle a "preview" request for a proposed trade from the frontend
 * or from an Execution agent.
 *
 * @param {any} sessionState
 * @param {{ riskPercent: number, comment?: string }} proposedTrade
 */
async function handleAutopilotProposedTrade(sessionState, proposedTrade) {
  const riskResult = evaluateProposedTrade(sessionState, proposedTrade);

  return {
    allowed: riskResult.allowed,
    risk: riskResult,
  };
}

module.exports = {
  handleAutopilotProposedTrade,
};

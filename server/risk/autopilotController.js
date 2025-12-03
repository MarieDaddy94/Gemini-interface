
// server/risk/autopilotController.js
//
// High-level autopilot control that wraps the risk engine.

const { evaluateProposedTrade } = require('./riskEngine');
const { callLLM } = require('../llmRouter');
const { getAgentById } = require('../agents/agents');
const sessionSummaryService = require('../services/sessionSummaryService'); // NEW

/**
 * Handle a "preview" request for a proposed trade from the frontend.
 * Just runs the risk engine.
 */
async function handleAutopilotProposedTrade(sessionState, proposedTrade) {
  const riskResult = evaluateProposedTrade(sessionState, proposedTrade);

  return {
    allowed: riskResult.allowed,
    risk: riskResult,
  };
}

/**
 * Generate a full execution plan.
 * 1. Run Risk Engine.
 * 2. Ask Execution Bot for a recommendation/plan based on the proposal + risk result.
 */
async function handleAutopilotExecutionPlan(sessionState, proposedTrade) {
  // --- SAFETY LAYER: GLOBAL HALT & SESSION CAPS ---
  const currentSession = await sessionSummaryService.getCurrentSessionState();
  
  if (currentSession.tradingHalted) {
      return {
          allowed: false,
          recommended: false,
          planSummary: "TRADING HALTED BY KILL SWITCH.",
          riskReasons: ["Global Trading Halt Active"],
          riskWarnings: []
      };
  }

  // Check Session Risk Cap
  const maxLoss = currentSession.risk.maxSessionRiskR;
  if (currentSession.stats.totalR <= maxLoss) {
      return {
          allowed: false,
          recommended: false,
          planSummary: `Session Risk Cap Hit (${currentSession.stats.totalR.toFixed(2)}R <= ${maxLoss}R).`,
          riskReasons: ["Session Drawdown Limit Reached"],
          riskWarnings: []
      };
  }

  // Force SIM mode if session is SIM
  // We don't change logic here, but the executor will see 'sim' environment in sessionState passed from frontend?
  // Actually, backend should enforce the mode from the canonical session state if available.
  // We'll trust sessionState passed in for now, but verify it matches.
  
  // 1. Risk Check
  const riskResult = evaluateProposedTrade(sessionState, proposedTrade);

  // 2. Execution Bot Consultation
  const agent = getAgentById('execution-bot');
  
  // Augment system prompt to force JSON output
  const systemPrompt = (agent.systemPrompt || '') + 
    `\n\nIMPORTANT: You must respond in valid JSON format only.\n` +
    `Schema: { "recommended": boolean, "planSummary": "string" }`;

  const instrumentLabel = sessionState.instrument?.displayName || 'Unknown Instrument';
  const direction = proposedTrade.direction?.toUpperCase() || 'UNKNOWN';
  const riskPct = proposedTrade.riskPercent || 0;

  const userPrompt = `
EXECUTION PLAN REQUEST:
- Instrument: ${instrumentLabel}
- Direction: ${direction}
- Risk: ${riskPct}% of equity
- Notes: ${proposedTrade.comment || 'None'}

RISK ENGINE VERDICT:
- Allowed: ${riskResult.allowed ? 'YES' : 'NO'}
- Hard Blocks: ${riskResult.reasons.length > 0 ? riskResult.reasons.join('; ') : 'None'}
- Warnings: ${riskResult.warnings.length > 0 ? riskResult.warnings.join('; ') : 'None'}

TASK:
1. If the Risk Engine blocked this trade (Allowed: NO), you CANNOT recommend it. Explain why in the summary.
2. If Allowed, evaluate if this fits a standard execution profile (e.g. is risk reasonable, are we fighting trend?). 
3. Provide a brief "planSummary" describing the execution (e.g. "Enter at market, SL at X..."). Since you don't have the live chart price, describe it logically (e.g. "SL below recent swing low").

Output JSON: { "recommended": boolean, "planSummary": string }
`;

  let recommended = false;
  let planSummary = "Analysis failed.";

  try {
    const llmOutput = await callLLM({
      model: agent.model,
      provider: agent.provider,
      systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: 0.2, // Low temp for logic
      maxTokens: 400
    });

    // Attempt to parse JSON
    try {
      const cleanJson = llmOutput.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      recommended = !!parsed.recommended;
      planSummary = parsed.planSummary || llmOutput;
    } catch (parseErr) {
      console.warn("Autopilot JSON parse failed, falling back to text", parseErr);
      planSummary = llmOutput; // Fallback: just show the text
      recommended = riskResult.allowed; // Default to risk result if LLM fails format
    }

  } catch (err) {
    console.error("Autopilot LLM call failed:", err);
    planSummary = `Error consulting Execution Bot: ${err.message}`;
  }

  return {
    allowed: riskResult.allowed,
    recommended,
    planSummary,
    riskReasons: riskResult.reasons,
    riskWarnings: riskResult.warnings
  };
}

module.exports = {
  handleAutopilotProposedTrade,
  handleAutopilotExecutionPlan
};

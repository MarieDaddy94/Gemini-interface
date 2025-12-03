
const express = require("express");
const router = express.Router();
const { callLLM } = require("../llmRouter");
const { getBrokerSnapshot } = require("../broker/brokerStateStore");
const policyEngine = require("../services/deskPolicyEngine");
const tiltService = require("../services/tiltService");

function cleanAndParseJson(text) {
  try {
    const clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(clean);
  } catch (e) {
    console.error("JSON Parse Error in Coordinator:", text);
    return null;
  }
}

async function runDeskCoordinator(input, deskState) {
    if (!deskState) {
      throw new Error("deskState is required");
    }

    const brokerSnapshot = getBrokerSnapshot("default");
    const accountContext = brokerSnapshot
      ? `Equity: ${brokerSnapshot.equity}, Balance: ${brokerSnapshot.balance}, Daily PnL: ${brokerSnapshot.dailyPnl}, Open Positions: ${brokerSnapshot.openPositions?.length || 0}`
      : "Broker disconnected";

    // Fetch live policy & tilt state
    const basePolicy = await policyEngine.getCurrentPolicy();
    const tiltState = await tiltService.getTiltState();
    const effectivePolicy = tiltService.applyDefenseMode(basePolicy, tiltState.defenseMode);

    const policyText = `
    Mode: ${effectivePolicy.mode.toUpperCase()}
    Max Risk: ${effectivePolicy.maxRiskPerTrade}%
    Max Daily Loss: ${effectivePolicy.maxDailyLossR}R
    Defense Mode: ${tiltState.defenseMode.toUpperCase()} (${tiltState.riskState})
    Active Signals: ${tiltState.tiltSignals.map(s => s.reason).join(", ") || "None"}
    Notes: ${effectivePolicy.notes}
    `;

    const systemPrompt = `
You are the **Trading Desk Coordinator** (The Boss).
You manage a team of AI agents and the Autopilot system.

**Current Desk Context:**
- Goal: "${deskState.goal || "None"}"
- Phase: "${deskState.sessionPhase}"
- Account: ${accountContext}

**ACTIVE DESK POLICY & DEFENSE STATE:**
${policyText}

**Your Job:**
1. Read the user's input.
2. Decide how the desk should react.
3. Update agent statuses and reply to the user.
4. **ENFORCE POLICY**: If Defense Mode is CAUTION/DEFENSE/LOCKDOWN, explicitly warn the user if they try to trade aggressively.
5. **RECOVERY**: If in LOCKDOWN, suggest a "Recovery Protocol" (brief review) instead of trading.

**Autopilot Operations:**
If the trader asks to "run autopilot" or "scan for trades":
1. Call \`run_autopilot_review\` with the symbol/timeframe matching the goal.
2. If the plan is ALLOWED (risk check passes):
   - Call \`commit_autopilot_proposal\` to stage it.
   - Tell the user: "I've staged a [Direction] plan for [Symbol] in the Autopilot tab. Please review."
3. If BLOCKED:
   - Do NOT commit.
   - Explain why risk (or defense mode) blocked it.

**JSON Response Format:**
{
  "message": "Your natural language reply.",
  "goal": "Updated goal string (optional)",
  "sessionPhase": "preSession" | "live" | "cooldown" | "postSession" (optional),
  "roleUpdates": [
    {
      "roleId": "strategist" | "risk" | "pattern" | "execution" | "quant" | "news" | "journal",
      "status": "idle" | "scanning" | "alert" | "busy" | "cooldown",
      "lastUpdate": "Short status text..."
    }
  ]
}
`;

    const userPrompt = `
User Input: "${input}"

Current Agent States:
${Object.values(deskState.roles)
  .map((r) => `- ${r.label}: ${r.status} (${r.lastUpdate})`)
  .join("\n")}

Respond with JSON updates.
`;

    const llmOutput = await callLLM({
      provider: "auto", 
      model: "gemini-2.5-flash",
      systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      temperature: 0.3,
      maxTokens: 1000,
    });

    let parsed = cleanAndParseJson(llmOutput);

    if (!parsed) {
      parsed = {
        message: "I understood, but had trouble syncing with the squad. (JSON Error)",
        roleUpdates: [],
      };
    }

    return {
      message: parsed.message || "Desk updated.",
      roleUpdates: Array.isArray(parsed.roleUpdates) ? parsed.roleUpdates : [],
      sessionPhase: parsed.sessionPhase || deskState.sessionPhase,
      goal: parsed.goal !== undefined ? parsed.goal : deskState.goal,
    };
}

router.post("/roundup", async (req, res) => {
  try {
    const { input, deskState } = req.body || {};
    const result = await runDeskCoordinator(input, deskState);
    return res.json(result);
  } catch (err) {
    console.error("Error in /api/desk/roundup:", err);
    return res.status(500).json({
      error: "Desk Coordinator crashed.",
      details: err.message
    });
  }
});

// GET /api/desk/tilt/state
router.get("/tilt/state", async (req, res) => {
    try {
        const state = await tiltService.getTiltState();
        res.json(state);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = {
  router,
  runDeskCoordinator
};

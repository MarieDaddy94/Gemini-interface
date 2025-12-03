
const express = require("express");
const router = express.Router();
const { callLLM } = require("../llmRouter");
const { getBrokerSnapshot } = require("../broker/brokerStateStore");
const policyEngine = require("../services/deskPolicyEngine");
const tiltService = require("../services/tiltService");
const playbookService = require("../services/playbookService");

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

    // Fetch Recommended Playbooks
    const recommendedLineup = await playbookService.getRecommendedLineup();
    const lineupText = `
    Primary: ${recommendedLineup.primary.map(p => `${p.name} (AvgR: ${p.performance.avgR})`).join(', ') || 'None'}
    Experimental: ${recommendedLineup.experimental.map(p => p.name).join(', ') || 'None'}
    `;

    const activePlaybooksContext = deskState.activePlaybooks && deskState.activePlaybooks.length > 0
        ? deskState.activePlaybooks.map(ap => `${ap.name} (${ap.role})`).join(', ')
        : "None selected yet.";

    const policyText = `
    Mode: ${effectivePolicy.mode.toUpperCase()}
    Max Risk: ${effectivePolicy.maxRiskPerTrade}%
    Max Daily Loss: ${effectivePolicy.maxDailyLossR}R
    Defense Mode: ${tiltState.defenseMode.toUpperCase()} (${tiltState.riskState})
    Active Signals: ${tiltState.tiltSignals.map(s => s.reason).join(", ") || "None"}
    Current Playbooks: ${activePlaybooksContext}
    `;

    const systemPrompt = `
You are the **Trading Desk Coordinator** (The Boss).
You manage a team of AI agents, playbooks, and the Autopilot system.

**Current Desk Context:**
- Goal: "${deskState.goal || "None"}"
- Phase: "${deskState.sessionPhase}"
- Account: ${accountContext}

**ACTIVE DESK POLICY & DEFENSE STATE:**
${policyText}

**AVAILABLE PLAYBOOK INVENTORY (Recommended):**
${lineupText}

**Your Job:**
1. Read the user's input.
2. **MANAGE PLAYBOOKS**: If the user asks to "set up for the day" or "what are we trading", assign Active Playbooks from the recommended list.
   - Assign 'primary' role to Tier A/B playbooks.
   - Assign 'experimental' role to Tier C/Exp playbooks.
   - Set risk caps (e.g., 2R for primary, 1R for experimental).
3. Decide how the desk should react to input.
4. **ENFORCE POLICY**: If Defense Mode is CAUTION/DEFENSE/LOCKDOWN, warn the user.

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
  ],
  "activePlaybooks": [
    {
      "playbookId": "id_from_context (if known, else match name)",
      "name": "Exact Name",
      "role": "primary" | "secondary" | "experimental",
      "riskCapR": number
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

    // Map playbook names back to IDs if LLM missed them
    if (parsed.activePlaybooks) {
        // We need the full list to map names
        const allPlaybooks = await playbookService.listPlaybooks();
        parsed.activePlaybooks = parsed.activePlaybooks.map(ap => {
            const match = allPlaybooks.find(p => p.name.toLowerCase() === ap.name.toLowerCase() || p.id === ap.playbookId);
            return {
                playbookId: match ? match.id : (ap.playbookId || `temp_${Date.now()}`),
                name: match ? match.name : ap.name,
                role: ap.role,
                riskCapR: ap.riskCapR || 1,
                usedR: 0 // Reset used on new assignment
            };
        });
    }

    return {
      message: parsed.message || "Desk updated.",
      roleUpdates: Array.isArray(parsed.roleUpdates) ? parsed.roleUpdates : [],
      sessionPhase: parsed.sessionPhase || deskState.sessionPhase,
      goal: parsed.goal !== undefined ? parsed.goal : deskState.goal,
      activePlaybooks: parsed.activePlaybooks // Pass back to frontend to update state
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

const express = require("express");
const router = express.Router();
const { callLLM } = require("../llmRouter");
const { getBrokerSnapshot } = require("../broker/brokerStateStore");

// Helper to clean LLM output if it wraps in markdown
function cleanAndParseJson(text) {
  try {
    const clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(clean);
  } catch (e) {
    console.error("JSON Parse Error in Coordinator:", text);
    return null;
  }
}

/**
 * Core Logic: The "Brain" of the Trading Room Floor.
 * 1. Reads current desk state (roles, goal).
 * 2. Reads live broker state (equity, PnL).
 * 3. Processes user instruction via LLM.
 * 4. Returns structured updates.
 */
async function runDeskCoordinator(input, deskState) {
    if (!deskState) {
      throw new Error("deskState is required");
    }

    // 1. Get Context
    const brokerSnapshot = getBrokerSnapshot("default"); // Default user session
    const accountContext = brokerSnapshot
      ? `Equity: ${brokerSnapshot.equity}, Balance: ${brokerSnapshot.balance}, Daily PnL: ${brokerSnapshot.dailyPnl}, Open Positions: ${brokerSnapshot.openPositions?.length || 0}`
      : "Broker disconnected";

    // 2. Build System Prompt
    const systemPrompt = `
You are the **Trading Desk Coordinator** (The Boss).
You manage a team of AI agents on a trading floor:
- **Strategist**: HTF bias & narrative.
- **Pattern**: Technical setups & triggers.
- **Risk**: Sizing, drawdown limits, stops.
- **Execution**: Entry precision & management.
- **Quant**: Statistics & probability.
- **News**: Calendar & macro events.

**Current Desk Context:**
- Goal: "${deskState.goal || "None"}"
- Phase: "${deskState.sessionPhase}"
- Account: ${accountContext}

**Your Job:**
1. Read the user's input.
2. Decide how the desk should react.
3. Update agent statuses (IDLE, SCANNING, ALERT, BUSY, COOLDOWN) and "lastUpdate" text to reflect what they should be doing.
4. Reply to the user clearly.

**Rules:**
- If the user asks to "Scan", set relevant agents (Strategist, Pattern) to SCANNING.
- If the user asks to "Stop", set everyone to COOLDOWN or IDLE.
- If the user asks for a "Status Report", check the account PnL and give a summary.
- Keep "lastUpdate" short (max 10 words).
- Output STRICT JSON.

**JSON Response Format:**
{
  "message": "Your natural language reply to the trader.",
  "goal": "Updated goal string (optional, null to keep current)",
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

    // 3. Build User Prompt
    const userPrompt = `
User Input: "${input}"

Current Agent States:
${Object.values(deskState.roles)
  .map((r) => `- ${r.label}: ${r.status} (${r.lastUpdate})`)
  .join("\n")}

Respond with JSON updates.
`;

    // 4. Call LLM (Gemini 2.5 Flash or GPT-4o)
    const llmOutput = await callLLM({
      provider: "auto", 
      model: "gemini-2.5-flash",
      systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      temperature: 0.3,
      maxTokens: 1000,
    });

    // 5. Parse & Fallback
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

/**
 * POST /api/desk/roundup
 */
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

module.exports = {
  router,
  runDeskCoordinator
};

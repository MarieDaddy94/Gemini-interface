
const express = require("express");
const router = express.Router();

/**
 * POST /api/desk/roundup
 *
 * Receives the user's message and the current desk state.
 * Returns a coordinator response and any state updates (role status, goal changes).
 *
 * Body:
 *  {
 *    input: string;          // User message
 *    deskState: { ... }      // Current frontend DeskContext state
 *  }
 */
router.post("/roundup", async (req, res) => {
  try {
    const { input, deskState } = req.body || {};

    if (!deskState) {
      return res.status(400).json({ error: "deskState is required" });
    }

    // --- STUB COORDINATOR LOGIC (Phase B) ---
    // In Phase C, this will be replaced by a real LLM call (Gemini/OpenAI).
    
    const safeGoal = deskState.goal || "No explicit goal set";
    
    // Simulate some "thinking" and role updates based on keywords
    const roleUpdates = [];
    let replyText = "";
    
    const lowerInput = (input || "").toLowerCase();

    if (lowerInput.includes("scan") || lowerInput.includes("look for")) {
        replyText = "Understood. I've instructed the Strategist and Pattern GPT to start scanning for setups matching your criteria.";
        roleUpdates.push({ roleId: "strategist", status: "scanning", lastUpdate: "Scanning HTF structure for setups." });
        roleUpdates.push({ roleId: "pattern", status: "scanning", lastUpdate: "Hunting liquidity sweeps on 1m/5m." });
    } else if (lowerInput.includes("stop") || lowerInput.includes("halt")) {
        replyText = "Stopping all active agents. Desk is now in cooldown.";
        roleUpdates.push({ roleId: "strategist", status: "cooldown", lastUpdate: "Standby." });
        roleUpdates.push({ roleId: "execution", status: "cooldown", lastUpdate: "Execution paused." });
    } else if (lowerInput.includes("risk")) {
        replyText = "Checking risk parameters. Risk Manager is reviewing open exposure.";
        roleUpdates.push({ roleId: "risk", status: "busy", lastUpdate: "Calculating exposure vs daily cap." });
    } else {
        replyText = `Copy that. Current desk goal is: "${safeGoal}". I'll keep the team aligned to this.`;
    }

    // Stub response
    return res.json({
      message: replyText,
      roleUpdates: roleUpdates,
      // We can also update the phase or goal if the LLM decides to
      sessionPhase: deskState.sessionPhase, 
      goal: deskState.goal,
    });

  } catch (err) {
    console.error("Error in /api/desk/roundup:", err);
    return res.status(500).json({
      error: "Desk roundup failed",
    });
  }
});

module.exports = router;

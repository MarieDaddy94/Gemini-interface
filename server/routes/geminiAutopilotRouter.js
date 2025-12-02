
const express = require("express");
const { generateAutopilotPlan } = require("../services/autopilotOrchestrator");

const router = express.Router();

router.post("/autopilot/analyze", async (req, res) => {
  try {
    const {
      symbol,
      timeframe,
      mode,
      question,
      brokerSnapshot,
      visionSummary,
      riskProfile,
    } = req.body;

    const plan = await generateAutopilotPlan({
      symbol,
      timeframe,
      mode,
      question,
      brokerSnapshot,
      visionSummary,
      riskProfile
    });

    return res.json(plan);
  } catch (error) {
    console.error("Gemini autopilot error:", error);
    return res.status(500).json({
      error: "Gemini autopilot call failed",
      details: error?.message || "Unknown error",
    });
  }
});

module.exports = router;


const express = require("express");
const { openai, OPENAI_AUTOPILOT_MODEL } = require("../openaiClient");

const router = express.Router();

router.post("/autopilot/review", async (req, res) => {
  try {
    const body = req.body;

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY not configured" });
    }

    const {
      brokerSnapshot,
      candidatePlan,
      visionSummary, // Now expects a structured object, though backward compatible with null
      journalInsights,
      riskProfile = "balanced",
    } = body;

    if (!brokerSnapshot || !candidatePlan) {
      return res.status(400).json({ error: "Missing brokerSnapshot or candidatePlan" });
    }

    const systemPrompt = `
You are the AUTOPILOT RISK ENGINE for a prop-firm style trading account.
You DO NOT chase trades. Your #1 job is capital preservation and enforcing risk rules.

You are reviewing a candidate trade plan from an AI "squad" for a trader on indices like US30/NAS100.
You receive several kinds of context:

1) brokerSnapshot:
   - balance, equity, openPnL, maxDailyDrawdownPct, openPositions

2) candidatePlan:
   - symbol, direction, entry, stopLoss, takeProfits[], riskPct, timeframe, rationale

3) visionSummary (if provided):
   - textSummary: stitched summary from chart/MTF/live/journal vision.
   - primarySymbol / primaryTimeframe
   - chartBias / htfBias / ltfBias / alignmentScorePct
   - liveWatchStatus (e.g. "invalidated", "tp_hit", "in_play")
   - journalCoachSummary: recent performance notes

4) journalInsights (structured text):
   - recentTakeaways[], recentMistakes[], recentWins[]

Your job:
- Decide whether this plan is safe and aligned with prop-style risk.
- Use visionSummary to judge alignment:
  - If chartBias/htfBias conflicts with trade direction -> lower riskScore or reject.
  - If liveWatchStatus says "invalidated" -> REJECT.
- Use journalInsights to be EXTRA conservative if the trader is in a losing streak or tilt.

Output STRICT JSON ONLY, no extra text:

{
  "approved": boolean,
  "riskScore": number,              // 0-100, higher = safer
  "reasons": string[],
  "requiredChanges": string[],
  "adjustedPlan": {
    "symbol": string,
    "direction": "long" | "short",
    "entry": number,
    "stopLoss": number,
    "takeProfits": number[],
    "riskPct": number,
    "rationale": string,
    "timeframe": string,
    "maxLossDollars"?: number,
    "maxLossPct"?: number
  }
}

Guidelines:
- "approved": false if risk rules, vision context, or journal context raise major red flags.
- If you disapprove, adjustedPlan MUST still be present (with safer parameters or 0 risk).
`;

    const userContext = {
      brokerSnapshot,
      candidatePlan,
      visionSummary: visionSummary || null,
      journalInsights: journalInsights || null,
      riskProfile,
    };

    // Use chat completions with JSON mode
    const response = await openai.chat.completions.create({
      model: OPENAI_AUTOPILOT_MODEL, 
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Here is the full context JSON for this trade decision:\n${JSON.stringify(userContext)}` },
      ],
      response_format: { type: "json_object" }
    });

    const raw = response.choices[0]?.message?.content;

    if (!raw) {
      console.error("[autopilot/review] No output from OpenAI");
      return res.status(500).json({ error: "No output from OpenAI" });
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error("[autopilot/review] Failed to parse JSON:", raw);
      return res.status(500).json({ error: "Model did not return valid JSON" });
    }

    return res.json(parsed);
  } catch (err) {
    console.error("[autopilot/review] Unexpected error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;


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
      visionSummary,
      journalInsights,
      riskProfile = "balanced",
    } = body;

    const systemPrompt = `
You are the AUTOPILOT RISK ENGINE for a prop-firm style trading account.
You DO NOT chase trades. Your #1 job is capital preservation and enforcing risk rules.

You are reviewing a candidate trade plan from an AI "squad" for a trader on indices like US30/NAS100.
You must:
- Check if the plan respects prop-style risk:
  - Max risk per trade (usually <= 1%).
  - Max daily drawdown (e.g., 4-5%).
  - Clustered risk (too many similar correlations).
- Consider broker state (equity, open PnL, open positions).
- Consider recent mistakes and emotional patterns from the journal.
- Optionally incorporate the chart vision summary (structure, liquidity, major levels).

You will output STRICT JSON ONLY, with no extra text, in this shape:

{
  "approved": boolean,
  "riskScore": number,              // 0-100, higher = safer & more aligned with rules
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

- "approved": false if risk rules are violated.
- If you disapprove, adjustedPlan SHOULD still be present, but with safer parameters.
- Be conservative if recent losses are heavy or drawdown is near limits.
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

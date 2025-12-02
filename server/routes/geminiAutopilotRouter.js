
const express = require("express");
const { gemini, GEMINI_AUTOPILOT_MODEL, GEMINI_THINKING_CONFIG } = require("../geminiClient");

const router = express.Router();

// This endpoint mirrors the OpenAI autopilot, but powered by Gemini 2.5 Pro.
router.post("/autopilot/analyze", async (req, res) => {
  try {
    const body = req.body;

    const {
      symbol,
      timeframe,
      mode,
      question,
      brokerSnapshot,
      playbookContext,
      visionSummary,
      riskProfile,
    } = body;

    // Build a single, very explicit prompt for Gemini.
    const systemInstruction = `
You are the lead strategist of an AI trading squad for a retail trader.

Your job:
- Read the account snapshot, risk context, and question.
- Propose ONE structured trade plan as JSON (no execution yet).
- Respect strict risk: never exceed requested risk% or blow daily drawdown.

You must return a JSON object ONLY in the "AUTOPILOT_PLAN_JSON" block I describe below.
`;

    const brokerText = `
[ACCOUNT SNAPSHOT]
Balance: ${brokerSnapshot?.balance || 0}
Equity: ${brokerSnapshot?.equity || 0}
Open PnL: ${brokerSnapshot?.openPnl || 0}
Daily PnL: ${brokerSnapshot?.dailyPnL ?? "n/a"}
Max Daily Drawdown %: ${brokerSnapshot?.maxDailyDrawdownPct ?? "n/a"}
Open Positions Count: ${brokerSnapshot?.openPositionsCount ?? 0}
`;

    const contextText = `
[CONTEXT]
Symbol: ${symbol}
Timeframe: ${timeframe}
Mode: ${mode}
Risk Profile: ${riskProfile ?? "balanced"}
Playbook Context: ${playbookContext ?? "none"}
Vision Summary (chart analysis): ${visionSummary ?? "none"}
User Question: ${question}
`;

    const jsonInstructions = `
You MUST respond in this exact JSON structure, and nothing else:

{
  "summary": string,          // natural language summary of the idea
  "rationale": string,        // reasoning & confluence
  "riskNotes": string,        // notes about risk, sizing, DD, etc.
  "jsonTradePlan": {
    "direction": "LONG" | "SHORT",
    "symbol": string,
    "entryType": "market" | "limit",
    "entryPrice": number | null,
    "stopLoss": number | null,
    "takeProfits": [
      { "level": number, "sizePct": number }
    ],
    "riskPct": number,
    "maxSlippagePoints": number | null,
    "timeInForce": "GTC" | "DAY" | null
  },
  "checklist": string[],      // bullet list of checks before executing
  "warnings": string[]        // reasons NOT to trade or to size down
}

Return ONLY valid JSON, with no markdown, no backticks, no commentary.
`;

    const contents = [
      {
        role: "user",
        parts: [
          { text: systemInstruction },
          { text: brokerText },
          { text: contextText },
          { text: jsonInstructions },
        ],
      },
    ];

    const response = await gemini.models.generateContent({
      model: GEMINI_AUTOPILOT_MODEL,
      contents,
      config: {
        responseMimeType: "application/json",
        ...GEMINI_THINKING_CONFIG
      },
    });

    const text = response.text; 

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      console.error("Failed to parse Gemini autopilot JSON:", text);
      return res.status(500).json({
        error: "Failed to parse Gemini autopilot plan",
        raw: text,
      });
    }

    return res.json(parsed);
  } catch (error) {
    console.error("Gemini autopilot error:", error);
    return res.status(500).json({
      error: "Gemini autopilot call failed",
      details: error?.message || "Unknown error",
    });
  }
});

module.exports = router;

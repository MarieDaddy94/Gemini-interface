
const express = require("express");
const { GoogleGenAI } = require("@google/genai");

const router = express.Router();

const client = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const GEMINI_VISION_MODEL =
  process.env.GEMINI_VISION_MODEL || "gemini-2.0-flash";

// History storage: history[symbol|timeframe] = last N analyses
const VISION_HISTORY = {};
const MAX_PER_KEY = 30;

function keyFor(symbol, timeframe) {
  return `${(symbol || "UNKNOWN").toUpperCase()}|${timeframe || "UNK"}`;
}

function storeVision(resp) {
  const key = keyFor(resp.symbol, resp.timeframe);
  if (!VISION_HISTORY[key]) VISION_HISTORY[key] = [];
  VISION_HISTORY[key].unshift(resp);
  if (VISION_HISTORY[key].length > MAX_PER_KEY) {
    VISION_HISTORY[key] = VISION_HISTORY[key].slice(0, MAX_PER_KEY);
  }
}

/**
 * POST /api/gemini/vision/chart
 * Specialized endpoint for trading chart analysis.
 */
router.post("/vision/chart", async (req, res) => {
  try {
    const { imageBase64, symbol, timeframe } = req.body || {};

    if (!imageBase64) {
      return res.status(400).json({ error: "imageBase64 is required" });
    }

    const prompt = `
You are a professional index day trader (US30, NAS100, XAU) analyzing a chart screenshot.
Return STRICT JSON ONLY with the following shape:

{
  "summary": string,
  "marketBias": "bullish" | "bearish" | "choppy" | "unclear",
  "structureNotes": string,
  "liquidityNotes": string,
  "fvgNotes": string,
  "suggestedPlayName": string
}

Interpret:
- Trend (HTF vs LTF if visible)
- Key liquidity grabs (highs/lows swept, equal highs/lows)
- Clear fair value gaps (premium/discount zones)
- Clean potential play like "PDH sweep into discount long" or "London high sweep into NY short".
`;

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const contents = [
      {
        role: "user",
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: "image/png",
              data: cleanBase64,
            },
          },
        ],
      },
    ];

    const response = await client.models.generateContent({
      model: GEMINI_VISION_MODEL,
      contents,
      config: {
        responseMimeType: "application/json",
        temperature: 0.2
      }
    });

    const text = response.text;

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      console.error("Gemini Vision JSON parse error:", text);
      const match = text.match(/```json\s*([\s\S]*?)\s*```/);
      if (match) {
          try {
              parsed = JSON.parse(match[1]);
          } catch (e2) {
              return res.status(500).json({ error: "Model did not return valid JSON", raw: text });
          }
      } else {
          return res.status(500).json({ error: "Model did not return valid JSON", raw: text });
      }
    }

    // Store history
    const withMeta = {
      ...parsed,
      symbol,
      timeframe,
      timestamp: new Date().toISOString(),
    };
    storeVision(withMeta);

    return res.json(withMeta);
  } catch (error) {
    console.error("Gemini Vision error:", error);
    return res.status(500).json({ error: "Gemini Vision failed", details: error.message });
  }
});

/**
 * POST /api/gemini/vision/recent-summary
 * Body: { symbol?: string; timeframe?: string; days?: number }
 */
router.post("/vision/recent-summary", (req, res) => {
  const { symbol, timeframe, days } = req.body;

  const key = keyFor(symbol, timeframe);
  const list = VISION_HISTORY[key] || [];

  const daysNum = typeof days === "number" && days > 0 ? days : 3;
  const cutoffMs = Date.now() - daysNum * 24 * 60 * 60 * 1000;

  const recent = list.filter(
    (v) => new Date(v.timestamp).getTime() >= cutoffMs
  );

  const stitched = recent
    .map(
      (v) =>
        `[${v.timestamp}] bias=${v.marketBias}, structure=${v.structureNotes}, liquidity=${v.liquidityNotes}, fvgs=${v.fvgNotes}, play=${v.suggestedPlayName}`
    )
    .join("\n");

  res.json({
    symbol: symbol || null,
    timeframe: timeframe || null,
    days: daysNum,
    summary: stitched,
    items: recent,
  });
});

module.exports = router;


const express = require("express");
const { GoogleGenAI } = require("@google/genai");

const router = express.Router();

const client = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const GEMINI_VISION_MODEL =
  process.env.GEMINI_VISION_MODEL || "gemini-2.0-flash";

/**
 * POST /api/gemini/vision/chart
 *
 * Specialized endpoint for trading chart analysis.
 * Body: { imageBase64: string, symbol?: string, timeframe?: string }
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

    // Ensure clean base64 (strip data URI prefix if present)
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
      // Fallback if model returns markdown fenced JSON
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

    return res.json(parsed);
  } catch (error) {
    console.error("Gemini Vision error:", error);
    return res.status(500).json({ error: "Gemini Vision failed", details: error.message });
  }
});

module.exports = router;

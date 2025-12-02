
const { GoogleGenAI } = require('@google/genai');
const OpenAI = require('openai');
const persistence = require('../persistence');

const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
const openaiKey = process.env.OPENAI_API_KEY;

const gemini = new GoogleGenAI({ apiKey });
// OpenAI client initialization handled in openaiClient.js usually, but standalone here for service isolation or use shared client
// For simplicity we instantiate if needed, or import shared
const { openai } = require('../openaiClient');

/**
 * Analyzes a chart image and stores the structured result.
 * 
 * @param {Object} params
 * @param {string} params.imageBase64 - Base64 string of the image (no prefix)
 * @param {string} params.symbol
 * @param {string} params.timeframe
 * @param {string} params.provider - 'gemini' | 'openai'
 * @param {string} params.source - 'manual' | 'desk' | 'autopilot'
 * @param {string} [params.context] - Optional extra context for the prompt
 */
async function analyzeAndStore({ imageBase64, symbol, timeframe, provider = 'gemini', source = 'manual', context }) {
    
    const systemPrompt = `
    You are an elite technical analyst for an intraday trading desk.
    Analyze the provided chart screenshot for ${symbol} (${timeframe}).
    
    Context: ${context || 'None provided.'}

    Return a **STRICT JSON** object with this exact schema (no markdown, no backticks):
    {
      "textSummary": "Concise 2-3 sentence summary of structure, key levels, and immediate bias.",
      "regime": "trending" | "ranging" | "choppy" | "unknown",
      "bias": "bullish" | "bearish" | "neutral" | "mixed",
      "volatility": "low" | "medium" | "high",
      "structureTags": ["string"], // e.g. "liquidity-sweep", "fvg", "break-of-structure", "consolidation"
      "levels": [
         { "type": "support"|"resistance"|"liquidity"|"fvg", "price": number (approx), "strength": "weak"|"medium"|"strong" }
      ],
      "playbookHints": [
         { "playbook": "name of setup", "matchScore": 0.0 to 1.0 }
      ]
    }
    `;

    let jsonResult = null;
    let rawText = "";

    try {
        if (provider === 'openai') {
            if (!openaiKey) throw new Error("OpenAI API Key not configured");
            const resp = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: systemPrompt },
                            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
                        ]
                    }
                ],
                response_format: { type: "json_object" },
                max_tokens: 1000
            });
            rawText = resp.choices[0].message.content;
            jsonResult = JSON.parse(rawText);
        } else {
            // Gemini Default
            const model = "gemini-2.5-flash";
            const resp = await gemini.models.generateContent({
                model,
                contents: [{
                    role: "user",
                    parts: [
                        { text: systemPrompt },
                        { inlineData: { mimeType: "image/jpeg", data: imageBase64 } }
                    ]
                }],
                config: { 
                    responseMimeType: "application/json",
                    temperature: 0.2
                }
            });
            rawText = resp.text;
            jsonResult = JSON.parse(rawText);
        }
    } catch (err) {
        console.error("[VisionService] Analysis failed:", err);
        throw new Error(`Vision analysis failed: ${err.message}`);
    }

    // Persist
    const snapshot = {
        id: `vis_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
        createdAt: new Date().toISOString(),
        symbol: symbol || "UNKNOWN",
        timeframe: timeframe || "UNKNOWN",
        source,
        ...jsonResult
    };

    await persistence.saveVisionSnapshot(snapshot);
    return snapshot;
}

/**
 * Get recent snapshots for context injection.
 */
async function getRecent(symbol, limit = 5) {
    return await persistence.getRecentVisionSnapshots(symbol, limit);
}

module.exports = { analyzeAndStore, getRecent };

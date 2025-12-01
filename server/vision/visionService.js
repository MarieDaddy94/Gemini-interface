
const { GoogleGenAI } = require('@google/genai');

const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
const ai = new GoogleGenAI({ apiKey });

/**
 * @param {string} fileBase64
 * @param {string} mimeType
 * @param {any} sessionState
 * @param {string} [question]
 */
async function analyzeChartImage({ fileBase64, mimeType, sessionState, question }) {
  const instrument = sessionState?.instrument?.symbol || 'Unknown Instrument';
  const timeframe = sessionState?.timeframe?.currentTimeframe || 'Unknown Timeframe';
  
  const systemPrompt = `
You are an expert technical analyst.
Analyze this chart image for ${instrument} on the ${timeframe} timeframe.

Focus on:
1. Market Structure (Trends, Highs/Lows)
2. Key Liquidity Levels (Pools of stops)
3. Supply & Demand Zones / Order Blocks
4. Specific trade ideas (Long/Short scenarios)

Be concise but specific. This summary will be used by other AI agents to make trading decisions.
`;

  const userPrompt = question ? `User Question: "${question}"` : "Provide a comprehensive technical analysis summary.";

  try {
    const model = 'gemini-2.5-flash'; 
    
    const response = await ai.models.generateContent({
      model: model,
      contents: [
        {
          role: 'user',
          parts: [
            { text: systemPrompt + "\n\n" + userPrompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: fileBase64
              }
            }
          ]
        }
      ],
      config: {
        temperature: 0.2,
        maxOutputTokens: 1024
      }
    });

    return response.text;
  } catch (error) {
    console.error("Gemini Vision Error:", error);
    throw new Error("Failed to analyze image with Gemini.");
  }
}

module.exports = { analyzeChartImage };

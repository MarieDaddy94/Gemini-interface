import { GoogleGenAI, Type, Schema } from "@google/genai";
import { AnalystPersona } from "../types";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

// Define the schema for the multi-persona response
const analysisSchema: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      analystName: {
        type: Type.STRING,
        enum: [AnalystPersona.QUANT_BOT, AnalystPersona.TREND_MASTER, AnalystPersona.PATTERN_GPT],
        description: "The name of the AI analyst persona speaking."
      },
      message: {
        type: Type.STRING,
        description: "The analysis or comment from this persona."
      }
    },
    required: ["analystName", "message"]
  }
};

export const getAnalystInsights = async (userPrompt: string, chartContext: string, imageBase64?: string) => {
  try {
    const modelId = "gemini-2.5-flash"; 
    
    const parts: any[] = [];
    
    // If an image is provided, add it as the first part
    if (imageBase64) {
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: imageBase64
        }
      });
    }

    // Add the text prompt
    parts.push({
      text: `
        Context: The user is looking at a trading dashboard with a TradingView chart.
        Broker Data Feed Summary: ${chartContext}
        
        User Question: "${userPrompt}"
        
        Task: You are simulating a team of AI financial analysts.
        1. QuantBot: Focuses on numbers, volatility, and statistical probability.
        2. TrendMaster AI: Focuses on moving averages, momentum, and macro trends.
        3. ChartPattern_GPT: Focuses on support/resistance, shapes (double bottom, head and shoulders), and technical indicators.
        
        ${imageBase64 ? "IMPORTANT: A screenshot of the user's screen is attached. Analyze the visual chart data (candlesticks, lines, indicators) to answer the user's question. The chat overlay you are residing in is on the right side of the image; ignore it and focus only on the trading charts on the left." : ""}

        Based on the user's question and the visual/data context, provide 1 to 2 distinct responses from the most relevant personas.
        Keep responses concise, professional, yet conversational like a chat room.
      `
    });

    const response = await ai.models.generateContent({
      model: modelId,
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
        systemInstruction: "You are a specialized AI trading team. Always reply in JSON format as an array of analyst messages."
      }
    });

    const jsonText = response.text;
    if (!jsonText) return [];
    
    return JSON.parse(jsonText) as { analystName: string; message: string }[];

  } catch (error) {
    console.error("Gemini API Error:", error);
    return [{
      analystName: AnalystPersona.QUANT_BOT,
      message: "I'm having trouble analyzing the data stream right now. Please try again."
    }];
  }
};
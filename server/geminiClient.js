
const { GoogleGenAI } = require("@google/genai");

// The client will pick up GEMINI_API_KEY from env if you pass an empty config or just the key.
// We allow passing the key explicitly to be safe, falling back to process.env.
const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
const gemini = new GoogleGenAI({ apiKey });

const GEMINI_AUTOPILOT_MODEL =
  process.env.GEMINI_AUTOPILOT_MODEL || "gemini-2.5-pro-preview-02-05"; // Defaulting to 2.5 Pro or similar

// Centralized thinking config for deep reasoning
const GEMINI_THINKING_CONFIG = {
  thinkingConfig: {
    thinkingBudget: 4096, 
  },
};

module.exports = {
  gemini,
  GEMINI_AUTOPILOT_MODEL,
  GEMINI_THINKING_CONFIG,
};

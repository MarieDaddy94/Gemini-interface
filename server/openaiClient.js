
const OpenAI = require("openai");

if (!process.env.OPENAI_API_KEY) {
  console.warn(
    "[openaiClient] WARNING: OPENAI_API_KEY is not set. OpenAI features will fail until you add it to your env."
  );
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Default to gpt-4o-mini if specific model not set, allowing override for reasoning models like o1-mini
const OPENAI_AUTOPILOT_MODEL =
  process.env.OPENAI_AUTOPILOT_MODEL || "gpt-4o-mini";

module.exports = { openai, OPENAI_AUTOPILOT_MODEL };

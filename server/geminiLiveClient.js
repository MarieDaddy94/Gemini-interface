
const { GoogleGenAI } = require("@google/genai");

if (!process.env.GEMINI_API_KEY) {
  console.warn("[Gemini] GEMINI_API_KEY is not set – Live API will not work.");
}

const geminiLiveClient = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  // For ephemeral tokens, v1alpha is often required or compatible
  httpOptions: { apiVersion: "v1alpha" },
});

const GEMINI_LIVE_MODEL =
  process.env.GEMINI_LIVE_MODEL || "gemini-2.0-flash-exp"; // Use a known live-compatible model alias

const GEMINI_LIVE_SESSION_DEFAULTS = {
  uses: 1,
  expireMinutes: 30,
  newSessionWindowMinutes: 2, // slightly wider window
};

module.exports = {
  geminiLiveClient,
  GEMINI_LIVE_MODEL,
  GEMINI_LIVE_SESSION_DEFAULTS,
};

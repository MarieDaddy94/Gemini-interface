// server/agents/agentConfig.js

/**
 * Agent configuration for your AI trading team.
 *
 * Each agent gets:
 *  - id: internal slug
 *  - name: display name (should match what you show in the UI)
 *  - provider: "openai" or "gemini"
 *  - model: LLM model ID
 *  - temperature: creativity level
 *  - journalStyle: guidance for journaling JSON
 *  - vision: whether this agent cares about screenshots
 */

const GLOBAL_ANALYST_SYSTEM_PROMPT = `
You are part of a collaborative AI trading team.
Each agent has a specialty and should speak in that persona.
You always:
- Explain your reasoning step by step (but keep it reasonably concise).
- Call out key levels, trend context, and risk.
- Respect the user's timeframe and instrument.
At the very end of your answer, emit a single-line JSON object prefixed by "JOURNAL_JSON:" describing what should be logged in the trading journal.
`.trim();

/**
 * Map of agentId -> config.
 *
 * IMPORTANT: keep names in sync with the UI (QuantBot, TrendMaster AI, Pattern_GPT, etc.).
 */
const agentsById = {
  quant_bot: {
    id: "quant_bot",
    name: "QuantBot",
    provider: "openai",          // GPT-5.1 for heavy reasoning
    model: process.env.OPENAI_QUANT_MODEL || "gpt-4o", // Fallback to 4o if 5.1 not available to key
    temperature: 0.4,
    vision: true,
    journalStyle: `
Short, quantified summary focused on statistics and risk:
- title: 1 short line like "US30 long scalp – NY session"
- summary: 2–4 bullet style sentences
- sentiment: one of ["bullish","bearish","neutral","mixed"]
- tags: array like ["US30","scalp","NY","1m","news-avoid"]
    `.trim(),
  },

  trend_master: {
    id: "trend_master",
    name: "TrendMaster AI",
    provider: "gemini",          // Gemini is great for multi-modal / chart images
    model: process.env.GEMINI_TREND_MODEL || "gemini-2.5-flash", 
    temperature: 0.6,
    vision: true,
    journalStyle: `
Focus on higher-timeframe structure and trend:
- title: trend + instrument, e.g. "XAUUSD in HTF downtrend"
- summary: 3–5 sentences mentioning HTF bias & lower-TF execution idea
- sentiment: "bullish","bearish","neutral","mixed"
- tags: include timeframe tags like ["4h","1h","structure"]
    `.trim(),
  },

  pattern_gpt: {
    id: "pattern_gpt",
    name: "Pattern_GPT",
    provider: "openai",
    model: process.env.OPENAI_PATTERN_MODEL || "gpt-4o-mini",
    temperature: 0.5,
    vision: true,
    journalStyle: `
Focus on chart patterns and liquidity grabs:
- title: pattern name + direction, e.g. "1m liquidity sweep into supply"
- summary: highlight pattern, invalidation, and target zones
- sentiment: "bullish","bearish","neutral","mixed"
- tags: include pattern tags like ["FVG","orderblock","liquidity","1m"]
    `.trim(),
  },

  // You can add more personas here later (e.g. MacroMind, RiskManager, NewsBot, etc.)
};

/**
 * Helper to look up by UI name if needed.
 */
function findAgentByName(name) {
  return Object.values(agentsById).find(
    (agent) => agent.name.toLowerCase() === String(name).toLowerCase()
  );
}

module.exports = {
  agentsById,
  findAgentByName,
  GLOBAL_ANALYST_SYSTEM_PROMPT,
};

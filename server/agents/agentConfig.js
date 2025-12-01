
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
You are part of a professional AI trading desk.
Each agent has a specialty and should speak in that persona.

**PRIME DIRECTIVE: CAPITAL PRESERVATION.**
- You are NOT here to force trades. You are here to protect the user's capital.
- If the setup is C-grade or the market is choppy, explicitly advise "NO TRADE".
- NEVER suggest a trade with less than 1.5R (Risk:Reward).
- ALWAYS identify the Invalidtion Level (Stop Loss) before the Entry.

You always:
- Explain your reasoning step by step using data.
- Call out key levels, trend context, and specific risk.
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
    provider: "gemini", 
    model: "gemini-2.5-flash",
    temperature: 0.3, // Low temp for precision
    thinkingBudget: 2048, // HIGH thinking budget for math/risk verification
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
    provider: "gemini",
    model: "gemini-2.5-flash", 
    temperature: 0.5,
    thinkingBudget: 1024, // Enable thinking for structure analysis
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
    model: "gpt-4o-mini",
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

  journal_coach: {
    id: "journal_coach",
    name: "Journal Coach",
    provider: "gemini",
    model: "gemini-2.5-flash",
    temperature: 0.5,
    vision: true,
    journalStyle: `
You are the Journal Coach, a trading psychologist + journaling assistant.

GOAL:
Turn the user's message and chart context into a clean, structured TRADING JOURNAL ENTRY.

You MUST always respond with your coaching advice text, followed by the JSON block.

JSON Fields required:
- "title": Playbook / setup name, e.g. "US30 – NY Open Liquidity Grab Long"
- "summary": 3–8 sentences summarizing context, reasoning, and lessons
- "tags": short tags like ["US30","NYO","liquidity","FVG","management"]
- "sentiment": "Bullish", "Bearish", or "Neutral"
- "symbol": e.g. "US30", "NAS100", "XAUUSD"
- "direction": "long" | "short" | null
- "outcome": "Open" | "Win" | "Loss" | "BE"

Logic:
- If the trade has NOT happened yet -> "outcome": "Open"
- Winning trade -> "outcome": "Win"
- Losing trade -> "outcome": "Loss"
- Breakeven -> "outcome": "BE"
- Planning buys -> "direction": "long"
- Planning sells -> "direction": "short"
    `.trim(),
  },
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


// server/agents/agentConfig.js

const GLOBAL_ANALYST_SYSTEM_PROMPT = `
You are part of a professional AI trading desk.
Each agent has a specialty and should speak in that persona.

**PRIME DIRECTIVE: CAPITAL PRESERVATION.**
- You are NOT here to force trades. You are here to protect the user's capital.
- If the setup is C-grade or the market is choppy, explicitly advise "NO TRADE".
- NEVER suggest a trade with less than 1.5R (Risk:Reward).
- ALWAYS identify the Invalidation Level (Stop Loss) before the Entry.

You always:
- Explain your reasoning step by step using data.
- Call out key levels, trend context, and specific risk.
- Respect the user's timeframe and instrument.
`.trim();

const agentsById = {
  quant_bot: {
    id: "quant_bot",
    name: "QuantBot",
    provider: "gemini", 
    model: "gemini-2.5-flash",
    temperature: 0.3,
    thinkingBudget: 2048,
    vision: true,
    journalStyle: `
Short, quantified summary focused on statistics and risk:
- title: 1 short line like "US30 long scalp – NY session"
- summary: 2–4 bullet style sentences
- sentiment: one of ["bullish","bearish","neutral","mixed"]
- tags: array like ["US30","scalp","NY","1m","news-avoid"]
    `.trim(),
    tools: ["get_broker_overview", "get_open_positions", "get_recent_trades", "append_journal_entry", "execute_order"]
  },

  trend_master: {
    id: "trend_master",
    name: "TrendMaster AI",
    provider: "gemini",
    model: "gemini-2.5-flash", 
    temperature: 0.5,
    thinkingBudget: 1024, 
    vision: true,
    journalStyle: `
Focus on higher-timeframe structure and trend:
- title: trend + instrument, e.g. "XAUUSD in HTF downtrend"
- summary: 3–5 sentences mentioning HTF bias & lower-TF execution idea
- sentiment: "bullish","bearish","neutral","mixed"
- tags: include timeframe tags like ["4h","1h","structure"]
    `.trim(),
    tools: ["get_recent_trades", "get_playbooks"]
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
    tools: ["get_recent_trades", "get_playbooks"]
  },

  journal_coach: {
    id: "journal_coach",
    name: "Journal Coach",
    provider: "gemini",
    model: "gemini-2.5-flash",
    temperature: 0.5,
    vision: true,
    journalStyle: `
You are the Journal Coach. Turn the context into a clean TRADING JOURNAL ENTRY.
    `.trim(),
    tools: ["get_recent_trades", "append_journal_entry"]
  }
};

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

const { brokerAndJournalTools } = require('./ai-providers');

// Core prompts
const quantBotPrompt = `
You are QuantBot, the lead quantitative trader on an intraday indices desk
specializing in US30, NAS100, and XAUUSD. Your job is to:

- Read the current chart context and recent trade history
- Propose precise, rule-based scalp or intraday trades with clear entry, SL, TP
- Use the user's own playbooks when available instead of inventing brand new rules
- Analyze R:R, volatility, and position sizing in practical dollar terms
- Update the trading journal with clear lessons after wins/losses

You must respect risk. Avoid revenge trading, overtrading, and oversized positions.
Always mention: bias (bullish/bearish/neutral), key levels, invalidation, and risk per trade.

Tools available: get_broker_overview, get_open_positions, get_playbooks, get_recent_trades, append_journal_entry.
`.trim();

const patternSeerPrompt = `
You are PatternSeer, a technical pattern and structure specialist.

You:
- Focus on market structure (HH/HL/LH/LL), supply/demand, liquidity sweeps, FVGs, and sessions
- Identify high-probability zones where trades should be taken or avoided
- Explain your reasoning visually ("price swept this high then rejected into X zone")
- Align with the user's playbooks (PDH/PDL/PDC, killzones, etc.) where possible

Your output should be concise but clear enough to trade from.
Tools available: get_recent_trades, get_playbooks, append_journal_entry.
`.trim();

const macroMindPrompt = `
You are MacroMind, a macro + news + regime context analyst.

You:
- Summarize the current macro environment affecting indices, dollar, and gold
- Highlight key economic releases, monetary policy events, and risk sentiment
- Explain how different regimes (risk-on/risk-off) should influence trade bias and size
- Translate macro into concrete trading adjustments: bias, avoid days, lower size, etc.

Stay practical and trading-focused, not academic.
Tools available: fetch_url_html, get_recent_trades.
`.trim();

const riskGuardianPrompt = `
You are RiskGuardian, the risk and money management overseer.

You:
- Monitor account balance, equity, drawdown, and position sizes
- Enforce maximum daily loss, per-trade risk, and max concurrent trades
- Help the user decide when to stop trading for the day
- Tag risky behaviors in the journal and suggest safer alternatives

You may be strict if needed, but always constructive and solution-oriented.
Tools available: get_broker_overview, get_open_positions, get_recent_trades, append_journal_entry.
`.trim();

const tradeCoachPrompt = `
You are TradeCoach, a trading psychologist and performance coach.

You:
- Review recent trades and journal entries
- Identify emotional patterns: FOMO, revenge, fear, hesitation
- Suggest practical habits, routines, and rules the user can actually follow
- Help the user turn bad days into clear lessons and future constraints

Always be supportive but honest.
Tools available: get_recent_trades, append_journal_entry.
`.trim();

// Base configs
const baseOpenAi = {
  provider: "openai",
  temperature: 0.35,
  maxTokens: 1400,
};

const baseGemini = {
  provider: "gemini",
  temperature: 0.35,
  maxTokens: 1400,
};

// Registered Agents Map
const registeredAgents = {
  "quant-bot": {
    id: "quant-bot",
    config: {
      id: "quant-bot",
      label: "QuantBot",
      description: "Execution & Probability",
      avatar: "🤖",
      color: "bg-blue-100 text-blue-800",
      model: "gpt-4o",
      systemPrompt: quantBotPrompt,
      ...baseOpenAi,
    },
    tools: brokerAndJournalTools, 
  },

  "pattern-seer": {
    id: "pattern-seer",
    config: {
      id: "pattern-seer",
      label: "PatternSeer",
      description: "Structure & Zones",
      avatar: "👁️",
      color: "bg-purple-100 text-purple-800",
      model: "gpt-4o",
      systemPrompt: patternSeerPrompt,
      ...baseOpenAi,
    },
    tools: brokerAndJournalTools,
  },

  "macro-mind": {
    id: "macro-mind",
    config: {
      id: "macro-mind",
      label: "MacroMind",
      description: "News & Sentiment",
      avatar: "🌍",
      color: "bg-emerald-100 text-emerald-800",
      model: "gemini-2.5-flash",
      systemPrompt: macroMindPrompt,
      ...baseGemini,
    },
    tools: brokerAndJournalTools,
  },

  "risk-guardian": {
    id: "risk-guardian",
    config: {
      id: "risk-guardian",
      label: "RiskGuardian",
      description: "Sizing & Drawdown",
      avatar: "🛡️",
      color: "bg-red-100 text-red-800",
      model: "gpt-4o-mini",
      systemPrompt: riskGuardianPrompt,
      ...baseOpenAi,
    },
    tools: brokerAndJournalTools,
  },

  "trade-coach": {
    id: "trade-coach",
    config: {
      id: "trade-coach",
      label: "TradeCoach",
      description: "Psychology & Review",
      avatar: "🧠",
      color: "bg-orange-100 text-orange-800",
      model: "gemini-2.5-flash",
      systemPrompt: tradeCoachPrompt,
      ...baseGemini,
    },
    tools: brokerAndJournalTools,
  },
};

function getRegisteredAgent(agentId) {
  return registeredAgents[agentId];
}

// For backward compatibility or direct listing
const AGENTS = Object.values(registeredAgents).map(a => a.config);

module.exports = {
  registeredAgents,
  getRegisteredAgent,
  AGENTS
};
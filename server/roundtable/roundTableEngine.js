
// server/roundtable/roundTableEngine.js
//
// Multi-agent trading round-table:
// - Strategist (GPT-5.1)
// - Pattern GPT (Gemini)
// - Risk Manager (GPT-5.1)
// - Execution Bot (GPT-5.1-mini)
//
// Each agent sees the same context but a different system prompt.
// Then the Strategist synthesizes a final plan from everyone’s replies.

const { callAgentLLM } = require('../llmRouter');
const {
  getAgentById,
} = require('../agents/agents');
const {
  getSimilarAutopilotHistory,
} = require('../history/autopilotHistoryStore');

/**
 * Build a textual context from session state + recent history + visual summary.
 *
 * @param {object} sessionState
 * @param {Array<object>} recentJournal
 * @param {string|null} visualSummary
 */
function buildContextText(sessionState, recentJournal, visualSummary) {
  const instrument = sessionState?.instrument || {};
  const tf = sessionState?.timeframe || {};
  const env = sessionState?.environment || 'sim';
  const mode = sessionState?.autopilotMode || 'off';

  const instrumentLabel =
    instrument.displayName || instrument.symbol || 'Unknown instrument';

  const parts = [];

  parts.push(
    `Instrument: ${instrumentLabel}`,
    `Timeframe: ${tf.currentTimeframe || 'n/a'}`,
    `Environment: ${env}`,
    `Autopilot mode: ${mode}`,
    ''
  );

  if (sessionState?.sessionTag) {
    parts.push(`Session: ${sessionState.sessionTag}`);
  }
  if (sessionState?.dayContext) {
    parts.push(`Day context: ${sessionState.dayContext}`);
  }

  // Last few journal / autopilot entries
  if (Array.isArray(recentJournal) && recentJournal.length) {
    parts.push('', 'Recent trades / journal notes (most recent first):');
    recentJournal.slice(0, 8).forEach((j, idx) => {
      const dir = (j.direction || '').toUpperCase();
      const risk =
        typeof j.riskPercent === 'number'
          ? `${j.riskPercent}%`
          : 'n/a';
      const pnl =
        typeof j.pnl === 'number'
          ? j.pnl.toFixed(2)
          : 'n/a';
      const verdict = j.allowed
        ? j.recommended
          ? 'Allowed/Recommended'
          : 'Allowed'
        : 'Blocked';

      parts.push(
        `${idx + 1}. ${j.instrumentSymbol || instrumentLabel} ${dir} ` +
          `(risk=${risk}, pnl=${pnl}, verdict=${verdict}, mode=${
            j.autopilotMode || mode
          }) - ${j.planSummary || ''}`
      );
    });
  }

  if (visualSummary) {
    parts.push('', 'Visual / chart summary:', visualSummary);
  }

  return parts.join('\n');
}

/**
 * @typedef {Object} RoundTableResultAgentMessage
 * @property {string} id
 * @property {string} displayName
 * @property {string} role
 * @property {string} provider
 * @property {string} model
 * @property {string} content
 */

/**
 * @typedef {Object} RoundTableResult
 * @property {string} finalSummary
 * @property {string} bias
 * @property {string} executionNotes
 * @property {string} riskNotes
 * @property {RoundTableResultAgentMessage[]} agents
 */

/**
 * Run the multi-agent trading round-table.
 *
 * @param {Object} params
 * @param {Object} params.sessionState
 * @param {string} params.userQuestion
 * @param {Array<Object>} params.recentJournal
 * @param {string|null} params.visualSummary
 * @returns {Promise<RoundTableResult>}
 */
async function runTradingRoundTable({
  sessionState,
  userQuestion,
  recentJournal = [],
  visualSummary = null,
}) {
  const strategist =
    getAgentById('strategist-main') || getAgentById('strategist');
  const pattern = getAgentById('pattern-gpt');
  const riskManager = getAgentById('risk-manager');
  const executionBot = getAgentById('execution-bot');

  if (!strategist) {
    throw new Error(
      'Strategist agent not configured. Check agents.js.'
    );
  }

  const similarHistory = sessionState
    ? getSimilarAutopilotHistory(sessionState, 25)
    : [];

  const contextText = buildContextText(
    sessionState,
    similarHistory,
    visualSummary
  );

  const questionText = (userQuestion || '').trim()
    ? `\n\nTRADER QUESTION:\n${userQuestion.trim()}`
    : '';

  const baseUserPrompt = `
You are part of an AI trading team helping Anthony trade indices like US30/NAS100 and XAUUSD.

Here is the current CONTEXT from the trading environment, recent trades, and chart summary:

${contextText}

${questionText}
`.trim();

  const userMessage = { role: 'user', content: baseUserPrompt };

  // ----- 1) Strategist -----
  const strategistSystemPrompt = `
You are the Strategist. Your job:
- Decide the likely directional bias (long / short / balanced).
- Describe the narrative: where price is in the larger structure, what it's hunting (liquidity, prior highs/lows).
- Suggest 1–2 clean "plays" (setups) that fit this context, with entry zone, invalidation, and target ideas.

Focus on US30/NAS100/XAUUSD intraday scalping style.
Always be concrete and keep it < 300 words.
  `.trim();

  const strategistText = await callAgentLLM({
    agentId: strategist.id,
    systemPrompt: strategistSystemPrompt,
    messages: [userMessage],
    temperature: 0.35,
    maxTokens: 800,
  });

  // ----- 2) Pattern GPT -----
  let patternText = '';
  if (pattern) {
    const patternSystemPrompt = `
You are Pattern GPT. You focus on:
- HTF/LTF structure
- Key levels (PDH/PDL, PDC, weekly highs/lows, obvious liquidity)
- Clean patterns: breakouts, retests, sweeps, fair value gaps, orderblocks.

Using the context and any chart summary, list:
- clear structural bias (bullish/bearish/ranging),
- 1–3 key zones of interest,
- a few "if/then" triggers that would confirm or kill a setup.

Be concrete; keep it < 300 words.
    `.trim();

    patternText = await callAgentLLM({
      agentId: pattern.id,
      systemPrompt: patternSystemPrompt,
      messages: [userMessage],
      temperature: 0.35,
      maxTokens: 700,
    });
  }

  // ----- 3) Risk Manager -----
  let riskText = '';
  if (riskManager) {
    const riskSystemPrompt = `
You are the Risk Manager. Your job:
- Enforce prop-firm style rules (max daily dd, max trades, etc.).
- Consider recent history in this context (streaks, consistency).
- Suggest position sizing, max number of attempts, and what *not* to do.

Give 3–7 bullet points that Anthony should follow *today*.
Keep it < 250 words.
    `.trim();

    riskText = await callAgentLLM({
      agentId: riskManager.id,
      systemPrompt: riskSystemPrompt,
      messages: [userMessage],
      temperature: 0.25,
      maxTokens: 600,
    });
  }

  // ----- 4) Execution Bot -----
  let executionText = '';
  if (executionBot) {
    const executionSystemPrompt = `
You are the Execution Bot. Your job is to turn the Strategist+Pattern+Risk ideas into:
- entry zones
- stop placement
- target ideas
- management guidelines (scale-in/out, when to bail).

You must assume Anthony is trading indices with high pip value (US30/NAS100).
Think in terms of points and clear "if/then" rules.
Keep it < 250 words.
    `.trim();

    const combinedForExecution = `
CONTEXT (same as others):
${contextText}

STRATEGIST NOTES:
${strategistText}

PATTERN NOTES:
${patternText}

RISK NOTES:
${riskText}

TRADER QUESTION (if any):
${userQuestion || '(none)'}
`.trim();

    const execUserMessage = {
      role: 'user',
      content: combinedForExecution,
    };

    executionText = await callAgentLLM({
      agentId: executionBot.id,
      systemPrompt: executionSystemPrompt,
      messages: [execUserMessage],
      temperature: 0.3,
      maxTokens: 700,
    });
  }

  // ----- 5) Final synthesis by Strategist -----
  const synthesisSystemPrompt = `
You are the Strategist acting as Moderator of an AI trading round-table.
You have heard from:
- Strategist (you)
- Pattern GPT
- Risk Manager
- Execution Bot

Your job is to produce a final compact gameplan for Anthony, with this structure:

1) BIAS: (one line, long / short / mixed, and which instrument/timeframes)
2) CONTEXT SNAPSHOT: 3–5 bullet points summarizing structure, key levels, and volatility.
3) PRIMARY PLAY: clear description of the main setup to execute (entry zone, invalidation, target, session).
4) RISK NOTES: 3–5 bullets summarizing risk constraints (max attempts, size, avoid conditions).
5) EXECUTION CHEAT-SHEET: quick bullet "if/then" rules for live trading (when to enter, add, cut).

Do NOT repeat the full raw messages; synthesize them.
Keep it under ~350–400 words.
  `.trim();

  const synthesisUserPrompt = `
CONTEXT:
${contextText}

TRADER QUESTION:
${userQuestion || '(none)'}

STRATEGIST SAID:
${strategistText}

PATTERN GPT SAID:
${patternText || '(no pattern agent configured)'}

RISK MANAGER SAID:
${riskText || '(no risk manager agent configured)'}

EXECUTION BOT SAID:
${executionText || '(no execution bot agent configured)'}
  `.trim();

  const synthesisText = await callAgentLLM({
    agentId: strategist.id,
    systemPrompt: synthesisSystemPrompt,
    messages: [{ role: 'user', content: synthesisUserPrompt }],
    temperature: 0.3,
    maxTokens: 900,
  });

  /** @type {RoundTableResultAgentMessage[]} */
  const agents = [];

  agents.push({
    id: strategist.id,
    displayName: strategist.displayName,
    role: strategist.role,
    provider: strategist.provider,
    model: strategist.model,
    content: strategistText,
  });

  if (pattern && patternText) {
    agents.push({
      id: pattern.id,
      displayName: pattern.displayName,
      role: pattern.role,
      provider: pattern.provider,
      model: pattern.model,
      content: patternText,
    });
  }

  if (riskManager && riskText) {
    agents.push({
      id: riskManager.id,
      displayName: riskManager.displayName,
      role: riskManager.role,
      provider: riskManager.provider,
      model: riskManager.model,
      content: riskText,
    });
  }

  if (executionBot && executionText) {
    agents.push({
      id: executionBot.id,
      displayName: executionBot.displayName,
      role: executionBot.role,
      provider: executionBot.provider,
      model: executionBot.model,
      content: executionText,
    });
  }

  // We keep finalSummary as the full synthesized text;
  // bias / risk / executionNotes can be parsed later if you want.
  return {
    finalSummary: synthesisText.trim(),
    bias: '', // optional: could parse a "BIAS:" line in future
    executionNotes: '',
    riskNotes: '',
    agents,
  };
}

module.exports = {
  runTradingRoundTable,
};

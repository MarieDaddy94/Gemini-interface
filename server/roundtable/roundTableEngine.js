
// server/roundtable/roundTableEngine.js
//
// Multi-agent "trading squad" round-table.
// Now uses a MarketSnapshot so the squad reasons from actual price structure.

const { callLLM } = require('../llmRouter');
const { getAgentById } = require('../agents/agents');
const {
  getMarketSnapshotForSession,
  formatMarketSnapshotForPrompt,
} = require('../market/marketSnapshot');

/**
 * @typedef {Object} RoundTableRequest
 * @property {any} sessionState
 * @property {string} userQuestion
 * @property {Array<any>} [recentJournal]
 * @property {Array<any>} [recentEvents]
 */

/**
 * @typedef {Object} RoundTableFinalPlan
 * @property {string} bias
 * @property {string} timeframe
 * @property {number} confidence
 * @property {string} narrative
 * @property {string} entryPlan
 * @property {string} riskPlan
 * @property {string} management
 * @property {string} checklist
 */

/**
 * @typedef {Object} RoundTableResponse
 * @property {RoundTableFinalPlan} finalPlan
 * @property {Array<{speaker:string;role:string;content:string}>} transcript
 * @property {Array<string>} riskFlags
 * @property {Array<string>} notesForJournal
 */

/**
 * Run a multi-agent "squad huddle" to create a trading plan.
 *
 * @param {RoundTableRequest} input
 * @returns {Promise<RoundTableResponse>}
 */
async function runTradingRoundTable(input) {
  const { sessionState, userQuestion, recentJournal = [], recentEvents = [] } =
    input || {};

  if (!userQuestion || typeof userQuestion !== 'string') {
    throw new Error('userQuestion is required for round-table.');
  }

  const instrument = sessionState?.instrument || {};
  const tf = sessionState?.timeframe || {};
  const env = sessionState?.environment || 'sim';
  const autopilotMode = sessionState?.autopilotMode || 'off';
  const riskConfig = sessionState?.riskConfig || {};

  const instrumentLabel =
    instrument.displayName || instrument.symbol || 'Unknown instrument';

  const sessionSummaryLines = [
    `Instrument: ${instrumentLabel}`,
    `Current timeframe: ${tf.currentTimeframe || 'n/a'}`,
    `Environment: ${env.toUpperCase()}`,
    `Autopilot mode: ${autopilotMode.toUpperCase()}`,
    `Risk config: maxRiskPerTrade=${riskConfig.maxRiskPerTradePercent ?? 'n/a'}% / maxDailyLoss=${riskConfig.maxDailyLossPercent ?? 'n/a'}%`,
  ];

  // ---- Market snapshot integration (Step B) ----
  let marketSnapshotText = '(no market snapshot available)';
  try {
    const snapshot = await getMarketSnapshotForSession(sessionState);
    marketSnapshotText = formatMarketSnapshotForPrompt(snapshot);
  } catch (err) {
    console.error('Failed to build market snapshot:', err);
  }

  const journalSummary =
    recentJournal && recentJournal.length > 0
      ? recentJournal
          .slice(0, 10)
          .map((j, idx) => {
            const dir = j.direction ? String(j.direction).toUpperCase() : '';
            const risk = j.riskPercent != null ? `${j.riskPercent}%` : '';
            const pnl =
              typeof j.pnl === 'number' ? `PnL=${j.pnl.toFixed(2)}` : '';
            const verdict =
              j.allowed === false
                ? 'Blocked'
                : j.recommended === false
                ? 'Allowed/NoRec'
                : 'Allowed/Rec';
            return `${idx + 1}. ${j.instrumentSymbol || instrumentLabel} ${dir} ${risk} (${verdict}) ${pnl} - ${j.planSummary || ''}`.trim();
          })
          .join('\n')
      : '(none provided)';

  const eventsSummary =
    recentEvents && recentEvents.length > 0
      ? recentEvents
          .slice(0, 15)
          .map(
            (e, idx) =>
              `${idx + 1}. [${e.level || e.type || 'info'}] ${
                e.message || JSON.stringify(e)
              }`
          )
          .join('\n')
      : '(none provided)';

  // Use Strategist as the "host" model
  const strategist = getAgentById('strategist-main') || getAgentById('strategist');

  const systemPrompt = `
You are orchestrating a TRADING SQUAD round-table for Anthony.

Squad members:
- Strategist: overall context, narrative, play selection.
- Trend Master: multi-timeframe trend and structure.
- Pattern GPT: patterns, liquidity, levels, timing windows.
- Risk Manager: risk rules, prop-style constraints.
- Execution Bot: concrete entry, SL/TP, and management rules.

You will simulate an internal discussion between these 5 roles.
The discussion should be focused, practical, and tailored for intraday trading on indices like US30/NAS100 or similar instruments.

You are given:

SESSION STATE
${sessionSummaryLines.join('\n')}

MARKET SNAPSHOT (multi-timeframe OHLC, most recent first within each series)
${marketSnapshotText}

RECENT AUTOPILOT JOURNAL (most recent first)
${journalSummary}

RECENT SYSTEM / AUTOPILOT EVENTS
${eventsSummary}

USER QUESTION
"${userQuestion}"

Your output MUST be a single JSON object, with NO extra commentary, in this exact shape:

{
  "finalPlan": {
    "bias": "long" | "short" | "neutral",
    "timeframe": "string",
    "confidence": number,
    "narrative": "string",
    "entryPlan": "string",
    "riskPlan": "string",
    "management": "string",
    "checklist": "string"
  },
  "transcript": [
    { "speaker": "Strategist", "role": "Strategist", "content": "..." },
    { "speaker": "Trend Master", "role": "Trend", "content": "..." },
    { "speaker": "Pattern GPT", "role": "Pattern", "content": "..." },
    { "speaker": "Risk Manager", "role": "Risk", "content": "..." },
    { "speaker": "Execution Bot", "role": "Execution", "content": "..." }
  ],
  "riskFlags": ["string"],
  "notesForJournal": ["string"]
}

Rules:
- "transcript" should contain 5-15 turns, mostly between these named roles.
- They MUST reason directly from the MARKET SNAPSHOT structure (recent closes, trend, volatility).
- "riskFlags" should highlight any reasons to reduce size, stand aside, or be extra cautious.
- "notesForJournal" should be ready-to-paste bullet notes Anthony could save in his trading journal.

Do NOT wrap the JSON in backticks or markdown.
  `.trim();

  const userPrompt = `Run the trading squad round-table and respond with the JSON object described above.`;

  const messages = [{ role: 'user', content: userPrompt }];

  let llmText = '';

  try {
    llmText = await callLLM({
      model: strategist.model,
      provider: strategist.provider,
      systemPrompt,
      messages,
      temperature: 0.35,
      maxTokens: 1400,
    });
  } catch (err) {
    console.error('Error in runTradingRoundTable LLM call:', err);
    throw new Error(
      'Round-table LLM call failed. See server logs for details.'
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(llmText);
  } catch (err) {
    console.error(
      'Failed to parse round-table JSON. Raw output:',
      llmText
    );
    throw new Error('Round-table JSON parse failed.');
  }

  const finalPlan = parsed.finalPlan || {};
  const bias =
    finalPlan.bias === 'short' || finalPlan.bias === 'neutral'
      ? finalPlan.bias
      : 'long';

  return {
    finalPlan: {
      bias,
      timeframe: finalPlan.timeframe || (tf.currentTimeframe || 'n/a'),
      confidence:
        typeof finalPlan.confidence === 'number'
          ? Math.min(Math.max(finalPlan.confidence, 0), 100)
          : 50,
      narrative: finalPlan.narrative || '',
      entryPlan: finalPlan.entryPlan || '',
      riskPlan: finalPlan.riskPlan || '',
      management: finalPlan.management || '',
      checklist: finalPlan.checklist || '',
    },
    transcript: Array.isArray(parsed.transcript) ? parsed.transcript : [],
    riskFlags: Array.isArray(parsed.riskFlags) ? parsed.riskFlags : [],
    notesForJournal: Array.isArray(parsed.notesForJournal)
      ? parsed.notesForJournal
      : [],
  };
}

module.exports = {
  runTradingRoundTable,
};


// server/history/autopilotCoach.js
//
// LLM coach that explains what your own history is telling you.

const { callAgentLLM } = require('../llmRouter');
const { getStatsForSession } = require('./autopilotHistoryStore');

/**
 * @param {object} sessionState
 */
async function runAutopilotCoach(sessionState) {
  const stats = getStatsForSession(sessionState, 120);

  const instrument = sessionState?.instrument || {};
  const tf = sessionState?.timeframe || {};

  const instrumentLabel =
    instrument.displayName || instrument.symbol || 'Unknown instrument';

  const lines = [];
  stats.entries.forEach((h, idx) => {
    const dir = (h.direction || '').toUpperCase();
    const risk = h.riskPercent != null ? `${h.riskPercent}%` : '';
    const pnl =
      typeof h.pnl === 'number' ? `PnL=${h.pnl.toFixed(2)}` : 'PnL=unknown';
    const verdict = h.allowed
      ? h.recommended
        ? 'Allowed/Rec'
        : 'Allowed/NoRec'
      : 'Blocked';
    lines.push(
      `${idx + 1}. ${new Date(h.createdAt).toISOString()} ${
        h.instrumentSymbol
      } ${dir} ${risk} (${verdict}) ${pnl} [mode=${h.autopilotMode}, env=${
        h.environment
      }] - ${h.planSummary || ''}`
    );
  });

  const historyText =
    lines.length > 0 ? lines.join('\n') : '(no matching history entries)';

  const systemPrompt = `
You are a trading performance coach and risk manager for Anthony.
You see his past Autopilot history and high-level stats for this
instrument / environment / mode context.

Your job:
- Explain what his OWN data says about:
  - win rate and expectancy
  - which types of trades tend to work vs fail
  - whether he is currently on a cold streak or hot streak
- Give 3–6 concrete "rules of thumb" he should follow for THIS context
  (e.g. "avoid counter-trend shorts in NYSE open", "cap risk to 0.25% when on
  a 3-loss streak", etc.).
- Be specific to indices like US30/NAS100, intraday style.

Keep it practical and under 400–500 words. Talk to Anthony directly.
Do NOT restate the raw JSON; interpret it.

  `.trim();

  const summaryStats = `
Instrument: ${instrumentLabel}
Timeframe: ${tf.currentTimeframe || 'n/a'}
Environment: ${sessionState?.environment || 'sim'}
Autopilot mode: ${sessionState?.autopilotMode || 'off'}

Stats (similar context):
- Total entries: ${stats.total}
- Closed trades: ${stats.closed}
- Wins: ${stats.wins}, Losses: ${stats.losses}, Breakeven: ${stats.breakeven}
- Win rate (closed only): ${stats.winRate.toFixed(1)}%
- Avg risk: ${stats.avgRisk.toFixed(2)}% of equity
- Avg PnL per closed trade: ${stats.avgPnl.toFixed(2)}
- Current losing streak (most recent, consecutive): ${stats.losingStreak}
- Recent direction bias: ${stats.recentDirectionBias || 'none'}
`;

  const userPrompt = `
STATS
${summaryStats}

RECENT HISTORY (most recent first)
${historyText}
`;

  const messages = [{ role: 'user', content: userPrompt }];

  const text = await callAgentLLM({
    agentId: 'journal-coach',
    systemPrompt,
    messages,
    temperature: 0.3,
    maxTokens: 900,
  });

  return {
    stats,
    coachNotes: text.trim(),
  };
}

module.exports = {
  runAutopilotCoach,
};

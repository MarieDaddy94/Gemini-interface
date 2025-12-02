
// server/agents/orchestrator.js
//
// Central orchestration for agent requests.
// Updated to use the advanced 'runAgentWithTools' runner to support tools like control_app_ui.

const { runAgentWithTools, brokerAndJournalTools } = require('../ai-providers');
const { createRuntimeContext } = require('../tool-runner');
const { getAgentById } = require('./agents');

/**
 * Build a short, compact summary of the current session state for system prompts.
 */
function summarizeSession(session) {
  const { environment, autopilotMode, instrument, timeframe, account } =
    session || {};

  const parts = [];

  if (instrument) {
    parts.push(
      `Instrument: ${instrument.displayName || instrument.symbol} [${
        instrument.symbol
      }]`
    );
  }

  if (timeframe) {
    parts.push(
      `Current timeframe: ${timeframe.currentTimeframe}, HTFs: ${
        timeframe.higherTimeframes
          ? timeframe.higherTimeframes.join(', ')
          : 'n/a'
      }`
    );
  }

  if (account) {
    const size = account.fundedSize || account.balance || account.equity;
    parts.push(
      `Account: ${
        account.isFundedAccount ? 'Funded' : 'Personal/Sim'
      }${size ? `, size ~${size}` : ''}`
    );
  }

  parts.push(`Environment: ${environment || 'sim'}`);
  parts.push(`Autopilot mode: ${autopilotMode || 'off'}`);

  return parts.join(' | ');
}

/**
 * Convert frontend AgentMessage[] into generic chat messages for LLM.
 */
function historyToChatMessages(history) {
  if (!Array.isArray(history) || history.length === 0) return [];

  return history.map((msg) => {
    const role = msg.sender === 'user' ? 'user' : 'assistant';
    const content = msg.content;
    return { role, content };
  });
}

/**
 * Main handler for agent requests.
 *
 * @param {{
 *   agentId?: string,
 *   userMessage: string,
 *   sessionState: any,
 *   history?: Array<any>
 * }} payload
 * @param {object} db - Database instance required for tools
 */
async function handleAgentRequest(payload, db) {
  const { agentId, userMessage, sessionState, history } = payload || {};

  if (!userMessage || typeof userMessage !== 'string') {
    throw new Error('userMessage is required and must be a string.');
  }

  // Default agent = strategist-main for now
  const chosenAgentId = agentId || 'strategist-main';
  const agentConfig = getAgentById(chosenAgentId);

  if (!agentConfig) {
    throw new Error(`Agent ${chosenAgentId} not found`);
  }

  const sessionSummary = summarizeSession(sessionState || {});

  const systemPrompt =
    (agentConfig.systemPrompt || '') +
    `

---
SESSION CONTEXT (for this conversation only):
${sessionSummary}
`;

  // Build conversation history for this agent
  const chatHistory = historyToChatMessages(history || []);

  // Prepare the request object for runAgentWithTools
  // We include ALL broker/journal tools by default for the orchestrator
  // You can restrict this if needed based on agent capabilities
  const request = {
    agent: {
      ...agentConfig,
      systemPrompt
    },
    messages: [
      ...chatHistory,
      { role: 'user', content: userMessage }
    ],
    tools: brokerAndJournalTools
  };

  // Create runtime context (needs accountId from sessionState)
  // We use accountId as the session key for DB lookups
  const accountId = sessionState?.account?.accountId || 'default-session';
  const ctx = createRuntimeContext(db, {
    brokerSessionId: accountId,
    journalSessionId: accountId,
    symbol: sessionState?.instrument?.symbol || 'US30'
  });

  // Execute
  const result = await runAgentWithTools(request, ctx);

  return {
    agentId: chosenAgentId,
    content: result.finalText,
    toolCalls: result.toolResults.map(t => ({
      toolName: t.toolName,
      args: t.args,
      result: t.result
    }))
  };
}

module.exports = {
  handleAgentRequest,
};


// server/agents/orchestrator.js
//
// Central orchestration for agent requests.
// This is what the /api/agent-router endpoint will call.

const { callLLM } = require('../llmRouter');
const { getAgentById } = require('./agents');

/**
 * @typedef {{
 *   environment: 'sim' | 'live',
 *   autopilotMode: 'off' | 'advisor' | 'semi' | 'full',
 *   instrument: { symbol: string, displayName: string, brokerSymbol?: string },
 *   timeframe: { currentTimeframe: string, higherTimeframes: string[] },
 *   account: {
 *     accountId?: string,
 *     accountName?: string,
 *     equity?: number,
 *     balance?: number,
 *     currency?: string,
 *     isFundedAccount: boolean,
 *     fundedSize?: number,
 *   },
 *   agents: Array<{
 *     id: string,
 *     name: string,
 *     role: string,
 *     description: string,
 *     modelHint?: string,
 *     isEnabled: boolean,
 *   }>,
 *   messages: Array<{
 *     id: string,
 *     agentId?: string,
 *     sender: 'user' | 'agent',
 *     content: string,
 *     createdAt: string,
 *     metadata?: any
 *   }>,
 *   isBrokerConnected: boolean,
 *   isNewsHighImpactNow: boolean,
 *   isVisionActive: boolean,
 * }} TradingSessionState
 */

/**
 * Build a short, compact summary of the current session state for system prompts.
 * @param {TradingSessionState} session
 * @returns {string}
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
 * @param {Array<{sender: 'user'|'agent', content: string}>} history
 * @param {string} agentName
 * @returns {Array<{role: 'user'|'assistant', content: string}>}
 */
function historyToChatMessages(history, agentName) {
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
 *   sessionState: TradingSessionState,
 *   history?: Array<{sender: 'user'|'agent', content: string, agentId?: string}>
 * }} payload
 */
async function handleAgentRequest(payload) {
  const { agentId, userMessage, sessionState, history } = payload || {};

  if (!userMessage || typeof userMessage !== 'string') {
    throw new Error('userMessage is required and must be a string.');
  }

  // Default agent = strategist-main for now
  const chosenAgentId = agentId || 'strategist-main';
  const agent = getAgentById(chosenAgentId);

  const sessionSummary = summarizeSession(sessionState || {});

  const systemPrompt =
    (agent.systemPrompt || '') +
    `

---
SESSION CONTEXT (for this conversation only):
${sessionSummary}
`;

  // Build conversation history for this agent
  const chatHistory = historyToChatMessages(history || [], agent.name);

  // Append the new user message
  const messages = [
    ...chatHistory,
    { role: 'user', content: userMessage },
  ];

  const replyText = await callLLM({
    model: agent.model,
    provider: agent.provider,
    systemPrompt,
    messages,
    temperature: 0.25,
    maxTokens: 800,
  });

  return {
    agentId: chosenAgentId,
    content: replyText,
  };
}

module.exports = {
  handleAgentRequest,
};

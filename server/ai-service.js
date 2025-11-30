// server/ai-service.js
const { AGENTS } = require('./ai-config');
const { callOpenAiWithTools, callGeminiWithTools } = require('./ai-providers');
const { createToolRunner } = require('./tool-runner');

async function handleAiRoute(reqBody, sessions, journals) {
  const { agentId, messages, vision, marketContext } = reqBody;
  
  const agent = AGENTS.find(a => a.id === agentId);
  if (!agent) {
    throw new Error(`Unknown agent: ${agentId}`);
  }

  // Build the tool runner with access to current state
  const toolRunner = createToolRunner(sessions, journals, marketContext || {});

  // Call Provider
  let result;
  if (agent.provider === 'openai') {
    result = await callOpenAiWithTools({ messages, vision }, agent, toolRunner);
  } else {
    result = await callGeminiWithTools({ messages, vision }, agent, toolRunner);
  }

  // Construct standardized response
  return {
    message: {
      role: 'assistant',
      content: result.finalMessage.content,
      id: Date.now().toString()
    },
    toolCalls: result.toolCalls,
    metadata: {
      // We could add sentiment analysis here if we wanted to
      sentiment: 'neutral'
    }
  };
}

module.exports = { handleAiRoute };

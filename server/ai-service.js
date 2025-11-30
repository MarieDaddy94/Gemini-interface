// server/ai-service.js
const { AGENTS } = require('./ai-config');
const { runAgentWithTools, brokerAndJournalTools } = require('./ai-providers');
const { createRuntimeContext } = require('./tool-runner');

async function handleAiRoute(reqBody, sessions, journals) {
  const { agentId, messages, vision, marketContext } = reqBody;
  
  const agent = AGENTS.find(a => a.id === agentId);
  if (!agent) {
    throw new Error(`Unknown agent: ${agentId}`);
  }

  // 1. Create the runtime context (adapters to DB/Broker)
  const ctx = createRuntimeContext(sessions, journals, marketContext || {});

  // 2. Filter tools allowed for this agent
  // We match the names in AGENTS[x].tools (e.g. 'get_broker_state')
  // with the names in brokerAndJournalTools. 
  // Note: We need to handle name aliases if necessary. 
  // Current mapping strategy: Direct match or simple alias lookup.
  
  const allowedToolNames = agent.tools || [];
  
  // Mapping table from ai-config names to runner names
  const nameMap = {
      'get_broker_state': 'get_broker_overview',
      'get_open_positions': 'get_open_positions',
      'get_history': 'get_recent_trades', // map history request to recent trades
      'get_journal_entries': 'get_recent_trades',
      'write_journal_entry': 'append_journal_entry',
      'get_playbook_stats': 'get_playbooks',
      'save_playbook_variant': 'save_playbook_variant',
      'fetch_url_html': 'fetch_url_html',
      'update_journal_sentiment': null // not impl yet
  };

  const selectedTools = [];
  allowedToolNames.forEach(requestedName => {
      const runnerName = nameMap[requestedName];
      if (runnerName) {
          const tool = brokerAndJournalTools.find(t => t.name === runnerName);
          if (tool && !selectedTools.includes(tool)) {
              selectedTools.push(tool);
          }
      }
  });

  // 3. Prepare Vision Images
  const visionImages = vision ? [{
      mimeType: vision.mimeType,
      data: vision.dataBase64
  }] : undefined;

  // 4. Run Agent
  const result = await runAgentWithTools({
      agent,
      messages,
      tools: selectedTools,
      visionImages
  }, ctx);

  // 5. Format Response
  return {
    message: {
      role: 'assistant',
      content: result.finalText,
      id: Date.now().toString()
    },
    toolCalls: result.toolResults.map(tr => ({
        id: 'completed-tool',
        name: tr.toolName,
        arguments: tr.args
    })),
    metadata: {
      sentiment: 'neutral'
    }
  };
}

module.exports = { handleAiRoute };

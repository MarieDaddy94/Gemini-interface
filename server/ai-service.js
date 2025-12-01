
// server/ai-service.js
const { AGENTS } = require('./ai-config');
const { runAgentWithTools, brokerAndJournalTools } = require('./ai-providers');
const { createRuntimeContext } = require('./tool-runner');
const { agentsById } = require('./agents/agentConfig');

async function handleAiRoute(reqBody, db) {
  const { agentId, messages, vision, marketContext } = reqBody;
  
  // Try to find agent via the new config first
  let agent = agentsById[agentId];
  if (!agent) {
     agent = AGENTS.find(a => a.id === agentId);
  }
  
  if (!agent) {
    throw new Error(`Unknown agent: ${agentId}`);
  }

  // 1. Create the runtime context (adapters to DB/Broker)
  // NOW TAKING DB INSTANCE INSTEAD OF MAPS
  const ctx = createRuntimeContext(db, marketContext || {});

  // 2. Filter tools allowed for this agent
  const allowedToolNames = agent.tools || [];
  
  const nameMap = {
      'get_broker_state': 'get_broker_overview',
      'get_open_positions': 'get_open_positions',
      'get_history': 'get_recent_trades',
      'get_journal_entries': 'get_recent_trades',
      'write_journal_entry': 'append_journal_entry',
      'get_playbook_stats': 'get_playbooks',
      'save_playbook_variant': 'save_playbook_variant',
      'fetch_url_html': 'fetch_url_html',
      'execute_order': 'execute_order',
      'update_journal_sentiment': null 
  };

  const selectedTools = [];
  
  if (allowedToolNames.length > 0) {
      allowedToolNames.forEach(requestedName => {
          let tool = brokerAndJournalTools.find(t => t.name === requestedName);
          if (!tool) {
              const runnerName = nameMap[requestedName];
              if (runnerName) {
                 tool = brokerAndJournalTools.find(t => t.name === runnerName);
              }
          }
          if (tool && !selectedTools.includes(tool)) {
              selectedTools.push(tool);
          }
      });
  } else {
      selectedTools.push(...brokerAndJournalTools.filter(t => t.name !== 'execute_order'));
  }

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
        arguments: tr.args,
        result: tr.result 
    })),
    metadata: {
      sentiment: 'neutral'
    }
  };
}

module.exports = { handleAiRoute };
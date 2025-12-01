
// server/ai-service.js
const { AGENTS } = require('./ai-config');
const { runAgentWithTools, brokerAndJournalTools } = require('./ai-providers');
const { createRuntimeContext } = require('./tool-runner');
const { agentsById } = require('./agents/agentConfig');

async function handleAiRoute(reqBody, sessions, journals) {
  const { agentId, messages, vision, marketContext } = reqBody;
  
  // Try to find agent via the new config first (it has the tool permissions)
  let agent = agentsById[agentId];
  if (!agent) {
     // Fallback to old config array if necessary
     agent = AGENTS.find(a => a.id === agentId);
  }
  
  if (!agent) {
    throw new Error(`Unknown agent: ${agentId}`);
  }

  // 1. Create the runtime context (adapters to DB/Broker)
  const ctx = createRuntimeContext(sessions, journals, marketContext || {});

  // 2. Filter tools allowed for this agent
  const allowedToolNames = agent.tools || [];
  
  // Mapping table from ai-config names to runner names
  const nameMap = {
      'get_broker_state': 'get_broker_overview',
      'get_open_positions': 'get_open_positions',
      'get_history': 'get_recent_trades',
      'get_journal_entries': 'get_recent_trades',
      'write_journal_entry': 'append_journal_entry',
      'get_playbook_stats': 'get_playbooks',
      'save_playbook_variant': 'save_playbook_variant',
      'fetch_url_html': 'fetch_url_html',
      'execute_order': 'execute_order', // New Mapping
      'update_journal_sentiment': null 
  };

  const selectedTools = [];
  
  // If allowedToolNames is empty/undefined, we might default to all safe tools, 
  // but for safety, better to require explicit permission for execute_order.
  
  if (allowedToolNames.length > 0) {
      allowedToolNames.forEach(requestedName => {
          // Check direct match first
          let tool = brokerAndJournalTools.find(t => t.name === requestedName);
          if (!tool) {
              // Check mapped name
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
      // Default set if no specific tools defined (legacy behavior)
      // Exclude execution tools by default
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
        result: tr.result // Pass result back to UI
    })),
    metadata: {
      sentiment: 'neutral'
    }
  };
}

module.exports = { handleAiRoute };
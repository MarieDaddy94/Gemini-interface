const express = require('express');
const { runAgentWithTools } = require('../ai-providers');
const { getRegisteredAgent } = require('../ai-config');
const { createRuntimeContext } = require('../tool-runner');

function createAgentsRouter(sessions, journals) {
  const router = express.Router();

  router.post('/api/agents/:agentId/chat', async (req, res) => {
    try {
      const { agentId } = req.params;
      const { messages, visionImages, accountId, symbol } = req.body;

      const agentReg = getRegisteredAgent(agentId);
      if (!agentReg) {
        return res.status(404).json({ error: `Unknown agent: ${agentId}` });
      }

      const { config, tools } = agentReg;

      // Create runtime context using the existing sessions/journals maps
      const ctx = createRuntimeContext(sessions, journals, {
        brokerSessionId: accountId,
        symbol: symbol || 'US30'
      });

      // Prepare vision data if present
      // Frontend sends { mimeType, data } (base64 w/o prefix)
      // runAgentWithTools expects array of { mimeType, dataBase64 } or data
      const processedVision = visionImages
        ? visionImages.map(img => ({
            mimeType: img.mimeType,
            dataBase64: img.data
          }))
        : undefined;

      const result = await runAgentWithTools(
        {
          agent: config,
          messages,
          tools, // The agent's specific allowed tools
          visionImages: processedVision
        },
        ctx
      );

      res.json(result);
    } catch (err) {
      console.error('Agent chat error:', err);
      res.status(500).json({ error: err.message || 'Unknown error processing agent chat' });
    }
  });

  return router;
}

module.exports = createAgentsRouter;

const express = require('express');
const { runAgentWithTools } = require('../ai-providers');
const { getRegisteredAgent } = require('../ai-config');
const { createRuntimeContext } = require('../tool-runner');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

function createAgentsRouter(db) {
  const router = express.Router();

  router.post('/api/agents/:agentId/chat', catchAsync(async (req, res, next) => {
    const { agentId } = req.params;
    const { messages, visionImages, accountId, symbol } = req.body;

    const agentReg = getRegisteredAgent(agentId);
    if (!agentReg) {
      return next(new AppError(`Unknown agent: ${agentId}`, 404));
    }

    const { config, tools } = agentReg;

    // Create runtime context using the DB instance
    const ctx = createRuntimeContext(db, {
      brokerSessionId: accountId,
      symbol: symbol || 'US30'
    });

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
  }));

  return router;
}

module.exports = createAgentsRouter;

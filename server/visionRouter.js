
const express = require('express');
const visionService = require('./services/visionService');

const visionRouter = express.Router();

// Helper: choose provider if "auto"
function resolveProvider(inputProvider) {
  if (inputProvider && inputProvider !== 'auto') return inputProvider;
  // Default strategy: prefer Gemini
  return 'gemini';
}

// POST /api/vision/analyze
// Replaces the old generic run endpoint with a structured one backed by DB
visionRouter.post('/analyze', async (req, res) => {
  try {
    const {
      fileBase64,
      symbol,
      timeframe,
      provider: rawProvider,
      source,
      question
    } = req.body || {};

    if (!fileBase64) {
      return res.status(400).json({ error: "fileBase64 is required" });
    }

    const provider = resolveProvider(rawProvider);

    const snapshot = await visionService.analyzeAndStore({
      imageBase64: fileBase64,
      symbol: symbol || 'UNKNOWN',
      timeframe: timeframe || 'UNKNOWN',
      provider,
      source: source || 'manual',
      context: question
    });

    // Map to frontend expected shape (VisionResult)
    const response = {
        visionSummary: snapshot.textSummary,
        // Detailed structured data
        snapshot
    };

    res.json(response);

  } catch (err) {
    console.error('Vision router error:', err);
    res.status(500).json({
      error: 'Vision analysis failed',
      details: err.message
    });
  }
});

// POST /api/vision/run (Legacy/Generic Handler Wrapper)
// Kept for compatibility if other components call it, but redirects to analyze logic if chart vision
visionRouter.post('/run', async (req, res) => {
    // If it's a chart vision request, route to new logic
    if (req.body.mode === 'chart_vision_v1' && req.body.payload?.imageBase64) {
        try {
            const p = req.body.payload;
            const snapshot = await visionService.analyzeAndStore({
                imageBase64: p.imageBase64,
                symbol: p.symbol,
                timeframe: p.timeframe,
                provider: resolveProvider(req.body.provider),
                source: 'legacy_wrapper',
                context: p.question
            });
            
            return res.json({
                rawText: snapshot.textSummary, // Compat
                summary: snapshot.textSummary,
                analysis: {
                    marketBias: snapshot.bias,
                    confidence: 0.9,
                    structureNotes: snapshot.textSummary,
                    keyZones: snapshot.levels?.map(l => `${l.type} @ ${l.price}`) || [],
                    suggestedPlaybookTags: snapshot.structureTags || []
                }
            });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }
    // Fallback for other modes (journal, mtf) - kept simple or error out
    res.status(400).json({ error: "Legacy vision mode not fully supported in Phase H upgrade." });
});

// GET /api/vision/recent
visionRouter.get('/recent', async (req, res) => {
    try {
        const { symbol, limit } = req.query;
        const snapshots = await visionService.getRecent(symbol, Number(limit) || 5);
        res.json({ snapshots });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = { visionRouter };

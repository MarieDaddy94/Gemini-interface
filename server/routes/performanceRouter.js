
const express = require('express');
const router = express.Router();
const playbookPerformanceService = require('../services/playbookPerformanceService');

// GET /api/performance/playbooks
router.get('/playbooks', async (req, res, next) => {
  try {
    const { symbol, lookbackDays } = req.query;
    const profiles = await playbookPerformanceService.getPlaybookProfiles({
      symbol: symbol === 'Auto' ? undefined : symbol,
      lookbackDays: lookbackDays ? Number(lookbackDays) : 90
    });
    res.json(profiles);
  } catch (err) {
    next(err);
  }
});

// GET /api/performance/desk-insights
// Returns top 3 GREEN and any active RED playbooks for a quick dashboard summary
router.get('/desk-insights', async (req, res, next) => {
  try {
    const { symbol } = req.query;
    const profiles = await playbookPerformanceService.getPlaybookProfiles({
      symbol: symbol === 'Auto' ? undefined : symbol,
      lookbackDays: 60
    });

    const green = profiles.filter(p => p.health === 'green').slice(0, 3);
    const red = profiles.filter(p => p.health === 'red' && p.sampleSize >= 3); // Only warn if it actually has data

    res.json({ green, red });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

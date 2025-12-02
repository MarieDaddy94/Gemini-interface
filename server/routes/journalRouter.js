
const express = require('express');
const router = express.Router();
const journalService = require('../services/journalService');

// GET /api/journal/list
router.get('/list', async (req, res, next) => {
  try {
    const { symbol, source, status, playbook, days } = req.query;
    // Pass user ID/session ID if auth was stricter
    const entries = await journalService.listEntries({ symbol, source, status, playbook, days });
    res.json(entries);
  } catch (err) {
    next(err);
  }
});

// GET /api/journal/stats
router.get('/stats', async (req, res, next) => {
  try {
    const { symbol, playbook, days } = req.query;
    const stats = await journalService.getStats({ symbol, playbook, days });
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

// POST /api/journal/log (Create)
router.post('/log', async (req, res, next) => {
  try {
    const entry = await journalService.logEntry(req.body);
    res.json(entry);
  } catch (err) {
    next(err);
  }
});

// POST /api/journal/update (Update status/result)
router.post('/update', async (req, res, next) => {
  try {
    const { id, ...updates } = req.body;
    if (!id) return res.status(400).json({ error: "Entry ID required" });
    const updated = await journalService.updateEntry(id, updates);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

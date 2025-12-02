
const express = require('express');
const router = express.Router();
const sessionSummaryService = require('../services/sessionSummaryService');

router.get('/list', async (req, res) => {
    const sessions = await sessionSummaryService.getSessions();
    res.json({ sessions });
});

router.post('/generate-summary', async (req, res) => {
    const { date } = req.body; // YYYY-MM-DD
    const summary = await sessionSummaryService.generateDailySummary(date);
    res.json({ summary });
});

module.exports = router;

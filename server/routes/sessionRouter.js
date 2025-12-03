
const express = require('express');
const router = express.Router();
const sessionSummaryService = require('../services/sessionSummaryService');

router.get('/list', async (req, res) => {
    const sessions = await sessionSummaryService.getSessions();
    res.json({ sessions });
});

router.get('/current', async (req, res) => {
    const state = await sessionSummaryService.getCurrentSessionState();
    res.json(state);
});

router.post('/halt', async (req, res) => {
    const { halted } = req.body;
    const state = await sessionSummaryService.toggleTradingHalt(halted);
    res.json(state);
});

router.post('/gameplan', async (req, res) => {
    try {
        const { marketSession, executionMode, riskCapR } = req.body;
        const session = await sessionSummaryService.createGameplan({ 
            marketSession: marketSession || 'NY',
            executionMode,
            riskCapR
        });
        res.json({ session });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/debrief', async (req, res) => {
    try {
        const { sessionId } = req.body;
        const session = await sessionSummaryService.generateDebrief(sessionId);
        res.json({ session });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// Legacy compat
router.post('/generate-summary', async (req, res) => {
    const { date } = req.body; // YYYY-MM-DD
    try {
        // Attempt to debrief a session with this date ID pattern
        const summary = await sessionSummaryService.generateDebrief(`sess_${date}_NY`);
        res.json({ summary });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;

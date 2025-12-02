
const express = require('express');
const router = express.Router();
const modelPolicyEngine = require('../services/modelPolicyEngine');

router.get('/current', async (req, res) => {
    const policy = await modelPolicyEngine.getActiveLineup();
    res.json(policy);
});

router.get('/recommendations', async (req, res) => {
    const recs = await modelPolicyEngine.generateRecommendations();
    res.json({ recommendations: recs });
});

router.post('/apply', async (req, res) => {
    const { recommendation } = req.body;
    const result = await modelPolicyEngine.applyRecommendation(recommendation);
    res.json(result);
});

module.exports = router;

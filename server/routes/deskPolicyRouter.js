
const express = require('express');
const router = express.Router();
const policyEngine = require('../services/deskPolicyEngine');

// GET /api/desk/policy/current
router.get('/current', async (req, res, next) => {
  try {
    const policy = await policyEngine.getCurrentPolicy();
    res.json(policy);
  } catch (err) {
    next(err);
  }
});

// POST /api/desk/policy/generate
router.post('/generate', async (req, res, next) => {
  try {
    // We could pass params here if we supported multi-user
    const policy = await policyEngine.generateDailyPolicy();
    res.json(policy);
  } catch (err) {
    next(err);
  }
});

// POST /api/desk/policy/update
router.post('/update', async (req, res, next) => {
  try {
    const updates = req.body;
    const current = await policyEngine.getCurrentPolicy();
    const newPolicy = { ...current, ...updates };
    await policyEngine.savePolicy(newPolicy);
    res.json(newPolicy);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

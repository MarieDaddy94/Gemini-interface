
const express = require("express");
const router = express.Router();
const playbookService = require("../services/playbookService");

// POST /api/playbooks/query (List/Search)
router.post("/query", async (req, res, next) => {
  try {
    const { symbol, timeframe, tier } = req.body;
    const results = await playbookService.listPlaybooks({ symbol, timeframe, tier });
    res.json({ playbooks: results });
  } catch (err) {
    next(err);
  }
});

// GET /api/playbooks/:id
router.get("/:id", async (req, res, next) => {
  try {
    const playbook = await playbookService.getPlaybook(req.params.id);
    if (!playbook) return res.status(404).json({ error: "Playbook not found" });
    res.json(playbook);
  } catch (err) {
    next(err);
  }
});

// POST /api/playbooks (Create)
router.post("/", async (req, res, next) => {
  try {
    const playbook = await playbookService.createPlaybook(req.body);
    res.json(playbook);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/playbooks/:id (Update)
router.patch("/:id", async (req, res, next) => {
  try {
    const updated = await playbookService.updatePlaybook(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// POST /api/playbooks/:id/refresh-stats
router.post("/:id/refresh-stats", async (req, res, next) => {
  try {
    const updated = await playbookService.recomputePlaybookStats(req.params.id);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// POST /api/playbooks/save (Legacy compat alias -> Create)
router.post("/save", async (req, res, next) => {
  try {
    const playbook = await playbookService.createPlaybook(req.body);
    res.json(playbook);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

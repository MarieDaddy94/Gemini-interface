
const express = require("express");
const router = express.Router();

// Simple in-memory store
const playbooks = [];

// Utility to get latest by symbol & timeframe
function queryPlaybooks(symbol, timeframe, limit = 5) {
  let list = playbooks.slice().sort((a, b) => {
    const timeA = a.lastUsedAt || a.createdAt;
    const timeB = b.lastUsedAt || b.createdAt;
    return timeB.localeCompare(timeA);
  });

  if (symbol) {
    list = list.filter((pb) => pb.symbol.toUpperCase() === symbol.toUpperCase());
  }
  if (timeframe) {
    list = list.filter((pb) => pb.timeframe === timeframe);
  }

  return list.slice(0, limit);
}

// POST /api/playbooks/query
router.post("/query", (req, res) => {
  const { symbol, timeframe, limit } = req.body;
  const results = queryPlaybooks(symbol, timeframe, limit || 5);
  res.json({ playbooks: results });
});

// POST /api/playbooks/save
router.post("/save", (req, res) => {
  const { symbol, timeframe, name, description, tags, notes } = req.body;

  if (!symbol || !timeframe || !name || !description) {
    return res.status(400).json({ error: "symbol, timeframe, name, description are required" });
  }

  const now = new Date().toISOString();
  const pb = {
    id: `pb_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    symbol: symbol.toUpperCase(),
    timeframe,
    name,
    description,
    tags: tags || [],
    createdAt: now,
    lastUsedAt: now,
    notes,
  };

  playbooks.push(pb);
  res.json(pb);
});

// POST /api/playbooks/mark-used
router.post("/mark-used", (req, res) => {
  const { id } = req.body;
  const pb = playbooks.find((p) => p.id === id);
  if (!pb) return res.status(404).json({ error: "Playbook not found" });
  pb.lastUsedAt = new Date().toISOString();
  res.json(pb);
});

module.exports = router;

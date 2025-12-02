
const express = require("express");
const router = express.Router();

const autoJournal = [];

// POST /api/journal/auto-log
router.post("/auto-log", (req, res) => {
  const body = req.body;

  if (!body.symbol || !body.direction || !body.environment || !body.timeframe) {
    return res.status(400).json({
      error: "symbol, direction, environment, timeframe are required",
    });
  }

  const now = new Date().toISOString();

  const entry = {
    id: `aj_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    timestamp: now,
    symbol: body.symbol.toUpperCase(),
    direction: body.direction,
    result: body.result || "open",
    rMultiple: body.rMultiple,
    pnl: body.pnl,
    environment: body.environment,
    timeframe: body.timeframe,
    notes: body.notes || "",
    source: body.source || "autopilot",
    meta: body.meta || {},
  };

  autoJournal.push(entry);
  console.log(`[AutoJournal] Logged ${entry.symbol} ${entry.direction}`);
  res.json(entry);
});

// POST /api/journal/auto-query
router.post("/auto-query", (req, res) => {
  const { symbol, limit } = req.body;

  let list = autoJournal.slice().sort((a, b) =>
    b.timestamp.localeCompare(a.timestamp)
  );

  if (symbol) {
    list = list.filter((e) => e.symbol.toUpperCase() === symbol.toUpperCase());
  }

  res.json({ entries: list.slice(0, limit || 20) });
});

module.exports = router;

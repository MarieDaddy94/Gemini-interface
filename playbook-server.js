const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const {
  getPlaybooks,
  addJournalEntry,
  computeAutopilotProposal,
} = require("./server/toolsData");

const app = express();
const PORT = process.env.PORT || 4000;
const LOG_FILE = path.join(__dirname, 'playbooks-log.json');

app.use(cors());
app.use(express.json());

function readLogFile() {
  try {
    if (!fs.existsSync(LOG_FILE)) {
      return [];
    }
    const data = fs.readFileSync(LOG_FILE, 'utf8');
    if (!data.trim()) return [];
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading playbook log file:', err);
    return [];
  }
}

function writeLogFile(entries) {
  try {
    fs.writeFileSync(LOG_FILE, JSON.stringify(entries, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing playbook log file:', err);
  }
}

app.post('/api/playbooks', (req, res) => {
  const entry = req.body;

  if (!entry || !entry.id || !entry.timestamp || !entry.sessionSummary) {
    return res.status(400).json({ ok: false, error: 'Invalid playbook payload' });
  }

  const entries = readLogFile();
  entries.push(entry);
  writeLogFile(entries);

  console.log(
    `[Playbook] Logged ${entry.focusSymbol || 'UnknownSymbol'} @ ${entry.timestamp} (id=${entry.id})`
  );

  res.status(201).json({ ok: true });
});

app.get('/api/playbooks', (req, res) => {
  const entries = readLogFile();
  res.json(entries);
});

// --- SQUAD TOOLS API ---

// GET /api/tools/playbooks
app.get("/api/tools/playbooks", (req, res) => {
  try {
    const { symbol, timeframe, direction } = req.query;
    const result = getPlaybooks({
      symbol: typeof symbol === "string" ? symbol : undefined,
      timeframe: typeof timeframe === "string" ? timeframe : undefined,
      direction: typeof direction === "string" ? direction : undefined,
    });

    res.json(result); // Return array
  } catch (err) {
    console.error("Error in /api/tools/playbooks", err);
    res.status(500).json({ error: "Failed to fetch playbooks" });
  }
});

// POST /api/tools/journal-entry
app.post("/api/tools/journal-entry", (req, res) => {
  try {
    const entry = addJournalEntry(req.body);
    res.json({ ok: true, entry });
  } catch (err) {
    console.error("Error in /api/tools/journal-entry", err);
    res.status(500).json({ error: "Failed to add journal entry" });
  }
});

// POST /api/tools/autopilot-proposal
// Body: { symbol, timeframe, direction, accountEquity, riskPercent, mode,
//         entryPrice, stopLossPrice, rMultipleTarget, visionSummary, notes }
app.post("/api/tools/autopilot-proposal", (req, res) => {
  try {
    const payload = req.body || {};
    const proposal = computeAutopilotProposal(payload);

    res.json({
      ok: proposal.riskEngine?.status !== "review",
      proposal,
    });
  } catch (err) {
    console.error("Error in /api/tools/autopilot-proposal", err);
    res.status(500).json({
      ok: false,
      error: "Failed to compute autopilot proposal",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Playbook server listening on http://localhost:${PORT}`);
  console.log(`Playbook log file: ${LOG_FILE}`);
});
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

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

app.listen(PORT, () => {
  console.log(`Playbook server listening on http://localhost:${PORT}`);
  console.log(`Playbook log file: ${LOG_FILE}`);
});

const fs = require('fs');
const path = require('path');

// Assuming server structure: server/memory/agentMemoryStore.js
// Data directory: root/data
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const MEMORY_FILE = path.join(DATA_DIR, 'agentMemory.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadMemory() {
  ensureDataDir();
  if (!fs.existsSync(MEMORY_FILE)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(MEMORY_FILE, 'utf8');
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('[AgentMemory] Failed to load memory file:', err);
    return [];
  }
}

function saveMemory(list) {
  ensureDataDir();
  try {
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.error('[AgentMemory] Failed to save memory file:', err);
  }
}

function truncateContent(text) {
  const maxLen = 1200;
  if (!text || text.length <= maxLen) return text;
  return text.slice(0, maxLen) + ' ...[truncated]';
}

/**
 * Append a memory entry for a given agent and session context.
 *
 * @param {object} params
 * @param {string} params.agentId
 * @param {string} params.displayName
 * @param {string} params.role
 * @param {object} params.sessionState
 * @param {string} params.topic   // e.g. "roundtable-strategist"
 * @param {string} params.content // raw text from agent
 */
function appendAgentMemory(params) {
  const {
    agentId,
    displayName,
    role,
    sessionState,
    topic,
    content,
  } = params;

  if (!agentId || !sessionState) return;

  const memory = loadMemory();

  const instrument = sessionState.instrument || {};
  const tf = sessionState.timeframe || {};

  const now = Date.now();
  const id = `${agentId}-${now}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  const instrumentSymbol =
    instrument.symbol || instrument.displayName || 'UNKNOWN';

  const record = {
    id,
    agentId,
    displayName: displayName || agentId,
    role: role || '',
    createdAt: now,
    topic: topic || 'unknown',
    instrumentSymbol,
    timeframe: tf.currentTimeframe || null,
    environment: sessionState.environment || null,
    autopilotMode: sessionState.autopilotMode || null,
    // Text content (possibly truncated)
    content: truncateContent(content || ''),
  };

  memory.push(record);
  saveMemory(memory);

  return record;
}

/**
 * Get memory for a given agent in a similar context.
 *
 * Similarity is based on:
 *  - same agentId
 *  - same instrumentSymbol (strict when present)
 *  - same environment & autopilotMode when present
 *  - timeframe is a softer filter (only enforced if both present)
 *
 * @param {string} agentId
 * @param {object} sessionState
 * @param {number} limit
 */
function getAgentMemoryForContext(agentId, sessionState, limit = 10) {
  const memory = loadMemory();
  if (!agentId || !sessionState) return [];

  const instrument = sessionState.instrument || {};
  const tf = sessionState.timeframe || {};

  const symbol =
    instrument.symbol || instrument.displayName || null;
  const environment = sessionState.environment || null;
  const autopilotMode = sessionState.autopilotMode || null;
  const timeframe = tf.currentTimeframe || null;

  const filtered = memory.filter((m) => {
    if (m.agentId !== agentId) return false;

    if (symbol && m.instrumentSymbol && m.instrumentSymbol !== symbol) {
      return false;
    }
    if (environment && m.environment && m.environment !== environment) {
      return false;
    }
    if (autopilotMode && m.autopilotMode && m.autopilotMode !== autopilotMode) {
      return false;
    }
    if (timeframe && m.timeframe && m.timeframe !== timeframe) {
      return false;
    }

    return true;
  });

  // Sort by most recent first
  filtered.sort((a, b) => b.createdAt - a.createdAt);

  return filtered.slice(0, limit);
}

/**
 * Build a short text snippet for use in prompts, summarizing memory entries.
 *
 * @param {Array<object>} records
 */
function formatAgentMemoryForPrompt(records) {
  if (!records || !records.length) {
    return '(no prior memory for this context yet)';
  }

  const lines = records.map((m, idx) => {
    const ts = new Date(m.createdAt).toISOString();
    const tfLabel = m.timeframe || 'n/a';
    const topic = m.topic || 'general';
    const snippet = (m.content || '').slice(0, 240).replace(/\s+$/g, '');
    return `${idx + 1}. [${ts} | TF=${tfLabel} | ${topic}] ${snippet}`;
  });

  return lines.join('\n');
}

module.exports = {
  appendAgentMemory,
  getAgentMemoryForContext,
  formatAgentMemoryForPrompt,
};

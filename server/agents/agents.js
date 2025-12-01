
// server/agents/agents.js
//
// Registry of AI agents and dynamic config loaded from JSON.
// This powers model routing and can be updated at runtime via API.

const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'agentConfig.json');

// ---- Default roster (used if no config file yet) ----

const DEFAULT_AGENTS = {
  'strategist-main': {
    id: 'strategist-main',
    displayName: 'Strategist',
    role: 'High-level strategy & narrative',
    provider: 'openai',
    model: 'gpt-4o',
    speed: 'slow',
    capabilities: ['strategy', 'planning', 'roundtable'],
  },
  strategist: {
    id: 'strategist',
    displayName: 'Strategist (Alt)',
    role: 'Strategy backup',
    provider: 'openai',
    model: 'gpt-4o-mini',
    speed: 'fast',
    capabilities: ['strategy'],
  },
  'trend-master': {
    id: 'trend-master',
    displayName: 'Trend Master',
    role: 'Multi-timeframe trend & structure',
    provider: 'openai',
    model: 'gpt-4o-mini',
    speed: 'fast',
    capabilities: ['trend', 'structure'],
  },
  'pattern-gpt': {
    id: 'pattern-gpt',
    displayName: 'Pattern GPT',
    role: 'Patterns, liquidity, timing windows',
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    speed: 'medium',
    capabilities: ['patterns', 'vision-context'],
  },
  'risk-manager': {
    id: 'risk-manager',
    displayName: 'Risk Manager',
    role: 'Risk limits, prop-style rules',
    provider: 'openai',
    model: 'gpt-4o',
    speed: 'slow',
    capabilities: ['risk', 'constraints'],
  },
  'execution-bot': {
    id: 'execution-bot',
    displayName: 'Execution Bot',
    role: 'Entry/exit specifics, R:R',
    provider: 'openai',
    model: 'gpt-4o-mini',
    speed: 'fast',
    capabilities: ['execution'],
  },
  'journal-coach': {
    id: 'journal-coach',
    displayName: 'Journal Coach',
    role: 'Performance analysis & coaching',
    provider: 'openai',
    model: 'gpt-4o-mini',
    speed: 'fast',
    capabilities: ['coaching', 'stats'],
  },
  'voice-parser': {
    id: 'voice-parser',
    displayName: 'Voice Parser',
    role: 'Parses spoken commands into trade instructions',
    provider: 'openai',
    model: 'gpt-4o-mini',
    speed: 'fast',
    capabilities: ['parsing'],
  },
};

let AGENTS = { ...DEFAULT_AGENTS };

// ---- Load & save config file ----

function loadConfigFromDisk() {
  if (!fs.existsSync(CONFIG_FILE)) {
    return;
  }
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    if (!raw.trim()) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      // We expect a map {id: agentConfig}
      // Merge carefully to preserve code-defined properties if needed, 
      // but here we trust the config file for the properties it has.
      AGENTS = { ...AGENTS, ...parsed };
      console.log('[Agents] Loaded agentConfig.json');
    }
  } catch (err) {
    console.error('[Agents] Failed to load agentConfig.json:', err);
  }
}

function saveConfigToDisk() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(AGENTS, null, 2), 'utf8');
  } catch (err) {
    console.error('[Agents] Failed to save agentConfig.json:', err);
  }
}

// Load on module init
loadConfigFromDisk();

// ---- Public API ----

function getAgentById(id) {
  if (!id) return null;
  return AGENTS[id] || null;
}

function getAgents() {
  return Object.values(AGENTS);
}

function getAgentsByCapability(cap) {
  return Object.values(AGENTS).filter((a) =>
    Array.isArray(a.capabilities) ? a.capabilities.includes(cap) : false
  );
}

/**
 * Update an agent's config (e.g. provider/model) and persist to disk.
 *
 * @param {string} id
 * @param {{provider?: string; model?: string}} patch
 */
function updateAgentConfig(id, patch) {
  const current = AGENTS[id];
  if (!current) return null;

  const updated = {
    ...current,
    ...(patch || {}),
  };

  AGENTS[id] = updated;
  saveConfigToDisk();
  return updated;
}

module.exports = {
  AGENTS,
  getAgentById,
  getAgents,
  getAgentsByCapability,
  updateAgentConfig,
};

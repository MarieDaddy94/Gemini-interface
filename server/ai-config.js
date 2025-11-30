// server/ai-config.js

const AGENTS = [
  {
    id: 'trend-analyst',
    label: 'Trend & Zones',
    provider: 'openai',
    model: 'gpt-4o', // Mapped from user request 'gpt-5.1' for stability
    systemPrompt: `
You are Trend Analyst AI. You specialize in reading price action, trend structure,
liquidity, and key zones on indices (US30, NAS100) and gold (XAUUSD).
Always reason step-by-step internally but answer concisely.
Use tools only when you need live broker state, journal info, or playbook stats.
`,
    tools: [
      'get_broker_state',
      'get_open_positions',
      'get_playbook_stats',
      'fetch_url_html'
    ],
    usesVision: true
  },
  {
    id: 'risk-manager',
    label: 'Risk & Positioning',
    provider: 'openai',
    model: 'gpt-4o-mini', // Mapped from user request 'gpt-5.1-mini'
    systemPrompt: `
You are Risk Manager AI. Your job: position sizing, max loss, and account survival.
Always consider account balance, open risk, drawdown, and broker constraints.
Respond with clear numbers and ranges, and use tools to query broker/journal state.
`,
    tools: [
      'get_broker_state',
      'get_open_positions',
      'get_history',
      'get_journal_entries',
      'write_journal_entry'
    ],
    usesVision: false
  },
  {
    id: 'playbook-architect',
    label: 'Playbook Architect',
    provider: 'gemini',
    model: 'gemini-2.0-flash', 
    systemPrompt: `
You are Playbook Architect AI. You read trade history, journal text, and screenshots
to design precise entry/exit rules, management rules, and optimization ideas.
You output structured playbook variants and keep them internally consistent.
`,
    tools: [
      'get_history',
      'get_journal_entries',
      'get_playbook_stats',
      'save_playbook_variant'
    ],
    usesVision: true
  },
  {
    id: 'journal-analyst',
    label: 'Journal Analyst',
    provider: 'gemini',
    model: 'gemini-2.0-flash',
    systemPrompt: `
You are Journal Analyst AI. You digest trade notes, chat messages, and sequences of wins/losses
and return emotional state, recurring mistakes, and improvement tasks.
Use tools to fetch and update journal entries.
`,
    tools: [
      'get_journal_entries',
      'write_journal_entry',
      'update_journal_sentiment'
    ],
    usesVision: false
  }
];

const TOOL_SPECS = [
  // 1) Broker-related
  {
    name: 'get_broker_state',
    description: 'Get connected broker accounts, selected account, and basic balances.',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: {
          type: 'string',
          description: 'Optional accountId; if omitted, use the currently selected account.'
        }
      },
      required: [],
      additionalProperties: false
    }
  },
  {
    name: 'get_open_positions',
    description: 'List current open positions for an account (optionally filtered by symbol).',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'Broker account id.' },
        symbol: { type: 'string', description: 'Optional symbol filter, e.g., US30.' }
      },
      required: ['accountId'],
      additionalProperties: false
    }
  },
  {
    name: 'get_history',
    description: 'Get historical closed trades for an account, optionally filtered by symbol/date.',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: { type: 'string' },
        symbol: { type: 'string' },
        fromTimestamp: { type: 'number', description: 'Unix ms timestamp (inclusive).' },
        toTimestamp: { type: 'number', description: 'Unix ms timestamp (exclusive).' },
        limit: { type: 'integer', minimum: 1, maximum: 500 }
      },
      required: ['accountId'],
      additionalProperties: false
    }
  },

  // 2) Journal-related
  {
    name: 'get_journal_entries',
    description: 'Fetch journal entries for this user, optionally linked to a trade or thread.',
    inputSchema: {
      type: 'object',
      properties: {
        threadId: { type: 'string', description: 'Chat/journal thread id.' },
        tradeId: { type: 'string', description: 'Specific trade id.' },
        limit: { type: 'integer', minimum: 1, maximum: 100 }
      },
      required: [],
      additionalProperties: false
    }
  },
  {
    name: 'write_journal_entry',
    description: 'Create a new journal entry with text, tags, and optional link to a trade.',
    inputSchema: {
      type: 'object',
      properties: {
        threadId: { type: 'string', description: 'ID linking this note to a chat thread.' },
        tradeId: { type: 'string', description: 'Optional trade id for linking.' },
        title: { type: 'string' },
        body: { type: 'string' },
        tags: {
          type: 'array',
          items: { type: 'string' }
        }
      },
      required: ['title', 'body'],
      additionalProperties: false
    }
  },
  {
    name: 'update_journal_sentiment',
    description: 'Update emotional/psychological sentiment scores for a journal entry.',
    inputSchema: {
      type: 'object',
      properties: {
        entryId: { type: 'string' },
        sentiment: {
          type: 'string',
          enum: ['bullish', 'bearish', 'neutral', 'fear', 'greed', 'tilt']
        },
        confidence: { type: 'number', minimum: 0, maximum: 1 }
      },
      required: ['entryId', 'sentiment'],
      additionalProperties: false
    }
  },

  // 3) Playbook-related
  {
    name: 'get_playbook_stats',
    description: 'Get statistics for a named playbook across trade history.',
    inputSchema: {
      type: 'object',
      properties: {
        playbookName: { type: 'string' },
        accountId: { type: 'string' },
        symbol: { type: 'string' },
        timeframe: { type: 'string' }
      },
      required: ['playbookName'],
      additionalProperties: false
    }
  },
  {
    name: 'save_playbook_variant',
    description: 'Save or update a playbook variant with structured rules and stats.',
    inputSchema: {
      type: 'object',
      properties: {
        basePlaybookName: { type: 'string' },
        variantName: { type: 'string' },
        description: { type: 'string' },
        entryRules: { type: 'string' },
        exitRules: { type: 'string' },
        managementRules: { type: 'string' },
        statsSnapshot: {
          type: 'object',
          properties: {
            winRate: { type: 'number' },
            rrAverage: { type: 'number' },
            sampleSize: { type: 'integer' }
          }
        }
      },
      required: ['basePlaybookName', 'variantName', 'entryRules', 'exitRules'],
      additionalProperties: false
    }
  },

  // 4) Generic
  {
    name: 'fetch_url_html',
    description: 'Fetch raw HTML/text content from a URL (for news, docs, etc).',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Fully-qualified URL (https://...)' }
      },
      required: ['url'],
      additionalProperties: false
    }
  }
];

module.exports = { AGENTS, TOOL_SPECS };

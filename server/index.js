const express = require('express');
const http = require('http'); // Required for WS
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Import Persistence
const db = require('./persistence');

// Import AI Handlers
const { handleAiRoute } = require('./ai-service');
const createAgentsRouter = require('./routes/agents');
// New Multi-Agent Router
const { runAgentsTurn, runAgentsDebrief } = require("./agents/llmRouter");
// Import Market Data Service
const { setupMarketData, getPrice } = require('./marketData');

const app = express();
const PORT = process.env.PORT || 4000;
const LOG_FILE = path.join(__dirname, 'playbooks-log.json');

// Create HTTP server explicitly to attach WS
const server = http.createServer(app);

/**
 * CORS Configuration
 */
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || true, // Allow all in dev/demo
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-openai-key', 'x-gemini-key']
  })
);

app.use(express.json({ limit: '10mb' }));

// Mount the new Agents router - pass the DB maps
app.use(createAgentsRouter(db.getSessionsMap(), db.getJournalsMap()));

// --- NEW Multi-agent AI chat endpoint ---
app.post("/api/agents/chat", async (req, res) => {
  try {
    const { agentIds, userMessage, chartContext, journalContext, screenshot, journalMode, agentOverrides, accountId } = req.body || {};

    if (!userMessage || !Array.isArray(agentIds) || agentIds.length === 0) {
      return res.status(400).json({
        error: "agentIds[] and userMessage are required",
      });
    }
    
    // Extract BYOK keys
    const apiKeys = {
      openai: req.headers['x-openai-key'],
      gemini: req.headers['x-gemini-key']
    };

    const results = await runAgentsTurn({
      agentIds,
      userMessage,
      chartContext: chartContext || {},
      journalContext: journalContext || [],
      screenshot: screenshot || null,
      journalMode: journalMode || "live",
      apiKeys,
      agentOverrides,
      // Pass State Maps from DB
      sessions: db.getSessionsMap(),
      journals: db.getJournalsMap(),
      accountId 
    });

    res.json({
      ok: true,
      agents: results,
    });
  } catch (err) {
    console.error("Error in /api/agents/chat:", err);
    res.status(500).json({
      error: "LLM router error",
      details: err.message,
    });
  }
});

app.post("/api/agents/debrief", async (req, res) => {
  try {
    const { previousInsights, chartContext, journalContext, agentOverrides, accountId } = req.body || {};

    if (!previousInsights || !Array.isArray(previousInsights)) {
      return res.status(400).json({ error: "previousInsights array is required" });
    }

    const apiKeys = {
      openai: req.headers['x-openai-key'],
      gemini: req.headers['x-gemini-key']
    };

    const results = await runAgentsDebrief({
      previousInsights,
      chartContext: chartContext || {},
      journalContext: journalContext || [],
      apiKeys,
      agentOverrides,
      sessions: db.getSessionsMap(),
      journals: db.getJournalsMap(),
      accountId
    });

    res.json({
      ok: true,
      insights: results
    });

  } catch (err) {
    console.error("Error in /api/agents/debrief:", err);
    res.status(500).json({
      error: "LLM debrief error",
      details: err.message
    });
  }
});

// --- LEGACY AI ROUTE ---
app.post('/api/ai/route', async (req, res) => {
  try {
    const result = await handleAiRoute(req.body, db.getSessionsMap(), db.getJournalsMap());
    res.json(result);
  } catch (err) {
    console.error('AI Route Error:', err);
    res.status(500).json({ 
      error: err.message || 'Internal AI Error',
      message: { role: 'assistant', content: 'I encountered an error processing your request.' }
    });
  }
});

// --- Playbook Logging Logic ---
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
  console.log(`[Playbook] Logged ${entry.focusSymbol || 'UnknownSymbol'} @ ${entry.timestamp}`);
  res.status(201).json({ ok: true });
});

app.get('/api/playbooks', (req, res) => {
  const entries = readLogFile();
  res.json(entries);
});

// --- TradeLocker Proxy Logic ---

function getBaseUrl(isDemo) {
  return isDemo
    ? 'https://demo.tradelocker.com/backend-api'
    : 'https://live.tradelocker.com/backend-api';
}

/**
 * POST /api/tradelocker/login
 */
app.post('/api/tradelocker/login', async (req, res) => {
  const { email, password, server, isDemo } = req.body || {};

  if (!email || !password || !server) {
    return res.status(400).send('Missing email, password or server');
  }

  const baseUrl = getBaseUrl(!!isDemo);

  try {
    // 1) Fetch JWT token
    const authRes = await fetch(`${baseUrl}/auth/jwt/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, server })
    });

    if (!authRes.ok) {
      const errorText = await authRes.text();
      console.error('TradeLocker auth error:', errorText);
      return res
        .status(authRes.status)
        .send(errorText || 'Failed to authenticate with TradeLocker');
    }

    const authJson = await authRes.json();
    const accessToken = authJson.accessToken || authJson.access_token;
    const refreshToken = authJson.refreshToken || authJson.refresh_token;

    if (!accessToken) {
      return res.status(500).send('TradeLocker did not return an access token');
    }

    // 2) List accounts
    const accountsRes = await fetch(`${baseUrl}/auth/jwt/all-accounts`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!accountsRes.ok) {
      const errorText = await accountsRes.text();
      return res
        .status(accountsRes.status)
        .send(errorText || 'Failed to fetch TradeLocker accounts');
    }

    const accountsJson = await accountsRes.json();
    const accountsRaw = Array.isArray(accountsJson)
      ? accountsJson
      : accountsJson.accounts || [];

    if (!accountsRaw.length) {
      return res.status(400).send('No TradeLocker accounts found for this user');
    }

    const accounts = accountsRaw.map((a, idx) => {
      const id = String(a.accountId ?? a.id ?? `acc-${idx}`);
      const accNum = Number(a.accNum ?? a.acc_num ?? idx + 1);
      const balance = a.balance ?? a.Balance ?? a.accountBalance ?? 0;
      const currency = a.currency ?? a.ccy ?? a.accountCurrency ?? 'USD';
      const name =
        a.name ?? a.accountName ?? a.broker ?? `Account ${accNum}`;
      const isDemo =
        a.isDemo ?? a.demo ?? a.accountType === 'DEMO';

      return {
        id,
        accNum,
        name,
        currency,
        balance: Number(balance),
        isDemo: !!isDemo
      };
    });

    const primary = accounts[0];
    const accountId = String(primary.id);
    const accNum = Number(primary.accNum);

    const sessionId = crypto.randomUUID();

    const sessionData = {
      baseUrl,
      accessToken,
      refreshToken,
      accountId,
      accNum,
      createdAt: Date.now(),
      isDemo: !!isDemo,
      email,
      server,
      accounts,
      lastPositionsById: {}, 
      latestState: {},        
      recentEventsQueue: [],   
      simulatedPositions: [] 
    };

    // SAVE SESSION VIA DB
    db.setSession(sessionId, sessionData);
    
    // Initialize empty journal if not exists
    if (db.getJournal(sessionId).length === 0) {
       db.setJournal(sessionId, []);
    }

    res.json({
      sessionId,
      accounts,
      accountId,
      accNum
    });
  } catch (err) {
    console.error('TradeLocker login fatal error', err);
    res.status(500).send('Internal error while connecting to TradeLocker');
  }
});

function getSessionOrThrow(sessionId, res) {
  if (!sessionId) {
    res.status(400).send('Missing sessionId');
    return null;
  }
  const session = db.getSession(sessionId);
  if (!session) {
    res.status(401).send('Unknown or expired sessionId');
    return null;
  }
  return session;
}

/**
 * POST /api/tradelocker/select-account
 */
app.post('/api/tradelocker/select-account', (req, res) => {
  const { sessionId, accountId, accNum } = req.body || {};
  const session = getSessionOrThrow(sessionId, res);
  if (!session) return;

  if (!accountId && accNum == null) {
    return res.status(400).send('Provide accountId or accNum to select account');
  }

  const accounts = session.accounts || [];
  const target = accounts.find((a) => {
    if (accountId && String(a.id) === String(accountId)) return true;
    if (accNum != null && Number(a.accNum) === Number(accNum)) return true;
    return false;
  });

  if (!target) {
    return res.status(400).send('Account not found in this session');
  }

  session.accountId = String(target.id);
  session.accNum = Number(target.accNum);
  session.lastPositionsById = {};
  session.latestState = {};
  session.recentEventsQueue = [];
  session.simulatedPositions = [];

  // Update DB
  db.setSession(sessionId, session);

  res.json({
    ok: true,
    accountId: session.accountId,
    accNum: session.accNum
  });
});

/**
 * POST /api/tradelocker/order
 */
app.post('/api/tradelocker/order', async (req, res) => {
  const { sessionId, symbol, side, size, stopLoss, takeProfit } = req.body || {};
  const session = getSessionOrThrow(sessionId, res);
  if (!session) return;

  try {
    const entryPrice = getPrice(symbol) || 0;
    
    if (entryPrice === 0) {
      return res.status(400).json({ error: "Market data unavailable for symbol" });
    }

    const positionId = `sim-${Date.now()}`;
    const newPosition = {
      id: positionId,
      symbol,
      side,
      size: Number(size),
      entryPrice,
      currentPrice: entryPrice,
      pnl: 0,
      openTime: new Date().toISOString(),
      sl: stopLoss,
      tp: takeProfit,
      isSimulated: true
    };

    if (!session.simulatedPositions) session.simulatedPositions = [];
    session.simulatedPositions.push(newPosition);
    
    // SAVE DB
    db.setSession(sessionId, session);

    res.json({ ok: true, orderId: positionId, entryPrice });
  } catch (err) {
    console.error('Order execution error', err);
    res.status(500).json({ error: 'Failed to execute order' });
  }
});

/**
 * GET /api/tradelocker/overview?sessionId=...
 */
app.get('/api/tradelocker/overview', async (req, res) => {
  const sessionId = req.query.sessionId;
  const session = getSessionOrThrow(sessionId, res);
  if (!session) return;

  const { baseUrl, accessToken, accountId, accNum } = session;

  try {
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      accNum: String(accNum)
    };

    const [stateRes, positionsRes] = await Promise.all([
      fetch(`${baseUrl}/trade/accounts/${accountId}/state`, { headers }),
      fetch(`${baseUrl}/trade/accounts/${accountId}/positions`, { headers })
    ]);

    if (!stateRes.ok) {
      return res.status(stateRes.status).send('Failed to fetch account state');
    }

    if (!positionsRes.ok) {
      return res.status(positionsRes.status).send('Failed to fetch open positions');
    }

    const stateJson = await stateRes.json();
    const positionsJson = await positionsRes.json();

    const balance = Number(stateJson.balance || stateJson.accountBalance || 0);
    const equity = Number(stateJson.equity || stateJson.accountEquity || balance);
    const marginUsed = Number(stateJson.marginUsed || stateJson.margin || 0);

    const rawPositions = Array.isArray(positionsJson)
      ? positionsJson
      : positionsJson.positions || positionsJson.data || [];

    const realPositions = rawPositions.map((p) => {
      const sideRaw = (p.side || p.direction || '').toString().toLowerCase();
      const side = sideRaw.includes('sell') || sideRaw.includes('short') ? 'sell' : 'buy';
      const symbol = p.symbol || p.instrument || 'UNKNOWN';
      const size = Number(p.volume || p.lots || 0);
      const entryPrice = Number(p.openPrice || p.entryPrice || 0);
      const currentPrice = Number(p.currentPrice || p.lastPrice || entryPrice);
      const pnl = Number(p.unrealizedPnL || p.pnl || 0);
      const openTime = p.openTime || p.created || new Date().toISOString();

      return {
        id: String(p.positionId || p.id),
        symbol,
        side,
        size,
        entryPrice,
        currentPrice,
        pnl,
        openTime
      };
    });

    // === SIMULATION MERGE ===
    const simulatedPositions = session.simulatedPositions || [];
    const updatedSimulated = simulatedPositions.map(pos => {
       const marketPrice = getPrice(pos.symbol) || pos.currentPrice;
       const diff = marketPrice - pos.entryPrice;
       let pnl = diff * pos.size; 
       if (pos.side === 'sell') pnl = -pnl;
       
       if (pos.symbol.includes('US30') || pos.symbol.includes('NAS')) pnl *= 1; 
       else if (pos.symbol.includes('BTC')) pnl *= 1; 
       else pnl *= 10000; 
       
       return {
         ...pos,
         currentPrice: marketPrice,
         pnl
       };
    });

    session.simulatedPositions = updatedSimulated;

    const positions = [...realPositions, ...updatedSimulated];

    // === DEEP READINESS: State Diffing ===
    
    const prevPositionsById = session.lastPositionsById || {};
    const currentPositionsById = {};
    const events = [];

    // 1. Detect Opened Positions
    for (const pos of positions) {
      currentPositionsById[pos.id] = pos;
      if (!prevPositionsById[pos.id]) {
        events.push({
          type: 'ORDER_FILLED',
          timestamp: new Date().toISOString(),
          data: {
            id: pos.id,
            symbol: pos.symbol,
            side: pos.side,
            pnl: 0,
            size: pos.size,
            entryPrice: pos.entryPrice
          }
        });
      }
    }

    // 2. Detect Closed Positions
    const closedIds = Object.keys(prevPositionsById).filter(
      (id) => !currentPositionsById[id]
    );

    if (closedIds.length) {
      const journalList = db.getJournal(sessionId);
      let journalChanged = false;

      for (const closedId of closedIds) {
        const prev = prevPositionsById[closedId];
        if (!prev) continue;

        const finalPnl = Number(prev.pnl || 0);
        let outcome = 'BreakEven';
        const threshold = 0.5;
        if (finalPnl > threshold) outcome = 'Win';
        else if (finalPnl < -threshold) outcome = 'Loss';

        let matchedEntryIndex = journalList.findIndex(e => e.linkedPositionId === closedId);

        if (matchedEntryIndex !== -1) {
          const entry = journalList[matchedEntryIndex];
          if (entry.outcome === 'Open') {
            journalList[matchedEntryIndex] = {
              ...entry,
              outcome,
              finalPnl,
              closedAt: new Date().toISOString(),
              pnl: finalPnl 
            };
            journalChanged = true;
          }
        } else {
          // GHOST TRADE LOG
          const autoEntry = {
            id: `auto-${closedId}`,
            timestamp: new Date().toISOString(),
            symbol: prev.symbol,
            direction: prev.side === 'buy' ? 'long' : 'short',
            timeframe: '15m', 
            entryPrice: prev.entryPrice,
            exitPrice: prev.currentPrice,
            size: prev.size,
            netPnl: finalPnl,
            pnl: finalPnl,
            currency: 'USD',
            playbook: 'Manual Execution',
            note: `Auto-logged from broker execution. PnL: ${finalPnl.toFixed(2)}`,
            source: 'broker',
            outcome,
            linkedPositionId: closedId,
            tags: ['AutoLog', prev.symbol],
            sessionId: sessionId
          };
          journalList.unshift(autoEntry);
          journalChanged = true;
        }

        events.push({
          type: 'POSITION_CLOSED',
          timestamp: new Date().toISOString(),
          data: {
            id: closedId,
            symbol: prev.symbol,
            side: prev.side,
            size: prev.size,
            entryPrice: prev.entryPrice,
            exitPrice: prev.currentPrice,
            pnl: finalPnl,
            reason: 'Closed on Broker'
          }
        });
      }

      if (journalChanged) {
        db.setJournal(sessionId, journalList);
      }
    }

    session.lastPositionsById = currentPositionsById;
    
    const simPnL = updatedSimulated.reduce((sum, p) => sum + p.pnl, 0);
    const adjustedEquity = equity + simPnL;

    session.latestState = {
      balance,
      equity: adjustedEquity,
      marginUsed
    };
    
    // Save DB
    db.setSession(sessionId, session);

    const overview = {
      isConnected: true,
      balance,
      equity: adjustedEquity,
      marginUsed,
      positions,
      recentEvents: events
    };

    res.json(overview);
  } catch (err) {
    console.error('TradeLocker overview fatal error', err);
    res.status(500).send('Internal error while fetching broker data');
  }
});

/**
 * GET /api/journal/entries
 */
app.get('/api/journal/entries', (req, res) => {
  const sessionId = req.query.sessionId;
  const session = getSessionOrThrow(sessionId, res);
  if (!session) return;

  const entries = db.getJournal(sessionId);
  res.json(entries);
});

/**
 * POST /api/journal/entry
 */
app.post('/api/journal/entry', (req, res) => {
  const { sessionId, entry } = req.body || {};
  const session = getSessionOrThrow(sessionId, res);
  if (!session) return;

  if (!entry || !entry.note) {
    return res.status(400).send('Missing entry or note');
  }

  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  const entryType =
    entry.entryType === 'Post-Trade' ||
    entry.entryType === 'SessionReview'
      ? entry.entryType
      : 'Pre-Trade';

  const validOutcomes = ['Open', 'Win', 'Loss', 'BreakEven'];
  const requestedOutcome = entry.outcome;
  let outcome =
    typeof requestedOutcome === 'string' &&
    validOutcomes.includes(requestedOutcome)
      ? requestedOutcome
      : 'Open';

  const tags = Array.isArray(entry.tags)
    ? entry.tags.map((t) => String(t)).filter((t) => t.trim().length > 0)
    : [];

  const stored = {
    id,
    timestamp,
    focusSymbol: entry.focusSymbol || 'Unknown',
    bias: entry.bias || 'Neutral',
    confidence: typeof entry.confidence === 'number' ? entry.confidence : 3,
    note: entry.note,
    entryType,
    outcome,
    tags,
    accountSnapshot: entry.accountSnapshot || null,
    linkedPositionId: entry.linkedPositionId || null,
    linkedSymbol: entry.linkedSymbol || null,
    finalPnl: entry.pnl || null,
    pnl: entry.pnl || null,
    closedAt: null,
    ...entry // Spread other fields
  };

  const list = db.getJournal(sessionId);
  list.unshift(stored);
  db.setJournal(sessionId, list);

  res.json(stored);
});

/**
 * PATCH /api/journal/entry/:id
 */
app.patch('/api/journal/entry/:id', (req, res) => {
  const { sessionId, updates } = req.body || {};
  const entryId = req.params.id;

  const session = getSessionOrThrow(sessionId, res);
  if (!session) return;

  const list = db.getJournal(sessionId);
  const idx = list.findIndex((e) => e.id === entryId);

  if (idx === -1) {
    return res.status(404).send('Journal entry not found');
  }

  const current = list[idx];
  const next = { ...current, ...updates };

  list[idx] = next;
  db.setJournal(sessionId, list);

  res.json(next);
});

// Health Check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// Setup WebSocket for Hybrid Market Data
setupMarketData(server);

// Start Server
server.listen(PORT, () => {
  console.log(`TradeLocker proxy API & Hybrid Market Feed listening on http://localhost:${PORT}`);
});
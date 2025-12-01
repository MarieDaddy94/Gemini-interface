




const express = require('express');
const http = require('http'); 
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');

// Import Persistence (Now SQLite wrapper)
const db = require('./persistence');

// Import AI Handlers
const { handleAiRoute } = require('./ai-service');
const createAgentsRouter = require('./routes/agents');
const { runAgentsTurn, runAgentsDebrief } = require("./agents/llmRouter");
const { setupMarketData, getPrice } = require('./marketData');

// Phase 2: Import new Orchestrator
const { handleAgentRequest } = require('./agents/orchestrator');

// Phase 4: Import Autopilot Controller
const { 
  handleAutopilotProposedTrade,
  handleAutopilotExecutionPlan 
} = require('./risk/autopilotController');

const {
  executeAutopilotTradeSim,
  getSimAccount,
  getSimPositions,
  closeSimPosition,
} = require('./autopilot/simExecutor');

const app = express();
const PORT = process.env.PORT || 4000;
const LOG_FILE = path.join(__dirname, 'playbooks-log.json');
const ACCESS_CODE = process.env.ACCESS_CODE || 'admin123'; // Default code if not set in env

const server = http.createServer(app);

// --- SECURITY: Rate Limiting ---
const aiLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, 
	limit: 100, 
	standardHeaders: 'draft-7',
	legacyHeaders: false,
    message: { error: "Too many AI requests, please try again later." }
});

app.use('/api/agents/', aiLimiter);
app.use('/api/ai/', aiLimiter);
app.use('/api/agent-router', aiLimiter); // Limit the new router too
app.use('/api/risk/', aiLimiter); // Limit risk checks
app.use('/api/autopilot/', aiLimiter); // Limit autopilot planning

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || true, 
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-openai-key', 'x-gemini-key']
  })
);

app.use(express.json({ limit: '10mb' }));

// --- AUTH ROUTE ---
app.post('/api/auth/verify', (req, res) => {
  const { code } = req.body;
  if (code === ACCESS_CODE) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Invalid access code' });
  }
});

// --- WEB PROXY ROUTE (Bypass X-Frame-Options) ---
app.get('/api/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('Missing url param');

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    // Copy important headers but strip blocking ones
    const contentType = response.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);

    // If it's HTML, we need to inject <base> tag for relative links to work
    if (contentType && contentType.includes('text/html')) {
      let html = await response.text();
      // Inject base tag right after head
      const baseTag = `<base href="${targetUrl}">`;
      html = html.replace('<head>', `<head>${baseTag}`);
      res.send(html);
    } else {
      // For images/css/js, just pipe the buffer
      const buffer = await response.arrayBuffer();
      res.send(Buffer.from(buffer));
    }
  } catch (err) {
    console.error('Proxy Error:', err.message);
    res.status(502).send(`Proxy Error: ${err.message}`);
  }
});

// Mount Agents router - PASS DB INSTANCE
app.use(createAgentsRouter(db));

// --- NEW Multi-agent AI chat endpoint ---
app.post("/api/agents/chat", async (req, res) => {
  try {
    const { agentIds, userMessage, chartContext, journalContext, screenshot, journalMode, agentOverrides, accountId } = req.body || {};

    if (!userMessage || !Array.isArray(agentIds) || agentIds.length === 0) {
      return res.status(400).json({
        error: "agentIds[] and userMessage are required",
      });
    }
    
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
      db, // Pass DB instance
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
      db, // Pass DB instance
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
    const result = await handleAiRoute(req.body, db);
    res.json(result);
  } catch (err) {
    console.error('AI Route Error:', err);
    res.status(500).json({ 
      error: err.message || 'Internal AI Error',
      message: { role: 'assistant', content: 'I encountered an error processing your request.' }
    });
  }
});

// --- PHASE 2: AGENT ROUTER ENDPOINT ---
app.post('/api/agent-router', async (req, res) => {
  try {
    const { agentId, userMessage, sessionState, history } = req.body || {};

    const result = await handleAgentRequest({
      agentId,
      userMessage,
      sessionState,
      history,
    });

    res.json(result);
  } catch (err) {
    console.error('Error in /api/agent-router:', err);
    res.status(500).json({
      error: 'Agent router error',
      message: err.message || 'Unknown error',
    });
  }
});

// --- PHASE 4: RISK / AUTOPILOT ROUTE ---
app.post('/api/risk/preview-trade', async (req, res) => {
  try {
    const { sessionState, proposedTrade } = req.body || {};

    const result = await handleAutopilotProposedTrade(
      sessionState,
      proposedTrade
    );

    res.json(result);
  } catch (err) {
    console.error('Error in /api/risk/preview-trade:', err);
    res.status(500).json({
      error: 'Risk preview error',
      message: err.message || 'Unknown error',
    });
  }
});

app.post('/api/autopilot/plan-trade', async (req, res) => {
  try {
    const { sessionState, proposedTrade } = req.body || {};
    
    if (!sessionState || !proposedTrade) {
      return res.status(400).json({ error: "Missing sessionState or proposedTrade" });
    }

    const result = await handleAutopilotExecutionPlan(
      sessionState,
      proposedTrade
    );

    res.json(result);
  } catch (err) {
    console.error('Error in /api/autopilot/plan-trade:', err);
    res.status(500).json({
      error: 'Autopilot planning error',
      message: err.message || 'Unknown error',
    });
  }
});

// ------------------------------
// Sim broker API
// ------------------------------

// GET /api/broker/sim/account
app.get('/api/broker/sim/account', (_req, res) => {
  try {
    const account = getSimAccount();
    res.json(account);
  } catch (err) {
    console.error('Error in /api/broker/sim/account:', err);
    res.status(500).json({
      error: 'Sim account error',
      message: err.message || 'Unknown error',
    });
  }
});

// GET /api/broker/sim/positions
app.get('/api/broker/sim/positions', (_req, res) => {
  try {
    const positions = getSimPositions();
    res.json(positions);
  } catch (err) {
    console.error('Error in /api/broker/sim/positions:', err);
    res.status(500).json({
      error: 'Sim positions error',
      message: err.message || 'Unknown error',
    });
  }
});

// POST /api/broker/sim/close-position
// Body: { positionId: string, closePrice: number }
app.post('/api/broker/sim/close-position', (req, res) => {
  try {
    const { positionId, closePrice } = req.body || {};
    if (!positionId || typeof closePrice !== 'number') {
      return res.status(400).json({
        error: 'BadRequest',
        message: 'positionId and closePrice are required.',
      });
    }
    const pos = closeSimPosition(positionId, closePrice);
    res.json(pos);
  } catch (err) {
    console.error('Error in /api/broker/sim/close-position:', err);
    res.status(500).json({
      error: 'Sim close position error',
      message: err.message || 'Unknown error',
    });
  }
});

// ------------------------------
// Autopilot Sim Execution
// ------------------------------
//
// POST /api/autopilot/execute-plan-sim
// Body:
// {
//   sessionState: TradingSessionState,
//   tradeRequest: { direction: 'long'|'short', riskPercent: number, notes?: string },
//   executionParams: { entryPrice: number, stopPrice?: number, executeIfRecommended?: boolean }
// }

app.post('/api/autopilot/execute-plan-sim', async (req, res) => {
  try {
    const { sessionState, tradeRequest, executionParams } = req.body || {};
    const result = await executeAutopilotTradeSim(
      sessionState,
      tradeRequest,
      executionParams
    );
    res.json(result);
  } catch (err) {
    console.error('Error in /api/autopilot/execute-plan-sim:', err);
    res.status(500).json({
      error: 'Autopilot sim exec error',
      message: err.message || 'Unknown error',
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
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!accountsRes.ok) {
      const errorText = await accountsRes.text();
      return res
        .status(accountsRes.status)
        .send(errorText || 'Failed to fetch TradeLocker accounts');
    }

    const accountsJson = await accountsRes.json();
    const accountsRaw = Array.isArray(accountsJson) ? accountsJson : accountsJson.accounts || [];

    if (!accountsRaw.length) {
      return res.status(400).send('No TradeLocker accounts found for this user');
    }

    const accounts = accountsRaw.map((a, idx) => {
      const id = String(a.accountId ?? a.id ?? `acc-${idx}`);
      const accNum = Number(a.accNum ?? a.acc_num ?? idx + 1);
      const balance = a.balance ?? a.Balance ?? a.accountBalance ?? 0;
      const currency = a.currency ?? a.ccy ?? a.accountCurrency ?? 'USD';
      const name = a.name ?? a.accountName ?? a.broker ?? `Account ${accNum}`;
      const isDemo = a.isDemo ?? a.demo ?? a.accountType === 'DEMO';

      return { id, accNum, name, currency, balance: Number(balance), isDemo: !!isDemo };
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

    // SAVE SESSION VIA DB (Async)
    await db.setSession(sessionId, sessionData);
    
    // Initialize empty journal if not exists
    const currentJournal = await db.getJournal(sessionId);
    if (currentJournal.length === 0) {
       await db.setJournal(sessionId, []);
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

async function getSessionOrThrow(sessionId, res) {
  if (!sessionId) {
    res.status(400).send('Missing sessionId');
    return null;
  }
  const session = await db.getSession(sessionId);
  if (!session) {
    res.status(401).send('Unknown or expired sessionId');
    return null;
  }
  return session;
}

app.post('/api/tradelocker/select-account', async (req, res) => {
  const { sessionId, accountId, accNum } = req.body || {};
  const session = await getSessionOrThrow(sessionId, res);
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

  await db.setSession(sessionId, session);

  res.json({
    ok: true,
    accountId: session.accountId,
    accNum: session.accNum
  });
});

app.post('/api/tradelocker/order', async (req, res) => {
  const { sessionId, symbol, side, size, stopLoss, takeProfit } = req.body || {};
  const session = await getSessionOrThrow(sessionId, res);
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
    
    await db.setSession(sessionId, session);

    res.json({ ok: true, orderId: positionId, entryPrice });
  } catch (err) {
    console.error('Order execution error', err);
    res.status(500).json({ error: 'Failed to execute order' });
  }
});

app.get('/api/tradelocker/overview', async (req, res) => {
  const sessionId = req.query.sessionId;
  const session = await getSessionOrThrow(sessionId, res);
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
      const journalList = await db.getJournal(sessionId);
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
        await db.setJournal(sessionId, journalList);
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
    
    await db.setSession(sessionId, session);

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

app.get('/api/journal/entries', async (req, res) => {
  const sessionId = req.query.sessionId;
  const session = await getSessionOrThrow(sessionId, res);
  if (!session) return;

  const entries = await db.getJournal(sessionId);
  res.json(entries);
});

app.post('/api/journal/entry', async (req, res) => {
  const { sessionId, entry } = req.body || {};
  const session = await getSessionOrThrow(sessionId, res);
  if (!session) return;

  if (!entry || !entry.note) {
    return res.status(400).send('Missing entry or note');
  }

  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  const entryType =
    entry.entryType === 'Post-Trade' || entry.entryType === 'SessionReview'
      ? entry.entryType
      : 'Pre-Trade';

  const validOutcomes = ['Open', 'Win', 'Loss', 'BreakEven'];
  const requestedOutcome = entry.outcome;
  let outcome =
    typeof requestedOutcome === 'string' && validOutcomes.includes(requestedOutcome)
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

  const list = await db.getJournal(sessionId);
  list.unshift(stored);
  await db.setJournal(sessionId, list);

  res.json(stored);
});

app.patch('/api/journal/entry/:id', async (req, res) => {
  const { sessionId, updates } = req.body || {};
  const entryId = req.params.id;

  const session = await getSessionOrThrow(sessionId, res);
  if (!session) return;

  const list = await db.getJournal(sessionId);
  const idx = list.findIndex((e) => e.id === entryId);

  if (idx === -1) {
    return res.status(404).send('Journal entry not found');
  }

  const current = list[idx];
  const next = { ...current, ...updates };

  list[idx] = next;
  await db.setJournal(sessionId, list);

  res.json(next);
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

const clientDistPath = path.join(__dirname, '..', 'dist');

if (fs.existsSync(clientDistPath)) {
  console.log(`[Server] Serving static files from ${clientDistPath}`);
  app.use(express.static(clientDistPath));

  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
} else {
  console.log('[Server] Dist folder not found. Assuming development mode.');
}

setupMarketData(server);

server.listen(PORT, () => {
  console.log(`AI Trading Analyst Backend (Protected) listening on port ${PORT}`);
});

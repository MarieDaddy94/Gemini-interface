
const express = require('express');
const http = require('http'); 
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');

// Import Logger
const logger = require('./logger');
const AppError = require('./utils/AppError');
const globalErrorHandler = require('./middleware/errorMiddleware');

// Import Persistence
const db = require('./persistence');

// Import AI Handlers
const { handleAiRoute } = require('./ai-service');
const createAgentsRouter = require('./routes/agents');
const { runAgentsTurn, runAgentsDebrief } = require("./agents/llmRouter");
const { setupMarketData, getPrice } = require('./marketData');

// --- Import OpenAI Routers & Proxy ---
const openaiRealtimeRouter = require('./routes/openaiRealtimeRouter');
const openaiAutopilotRouter = require('./routes/openaiAutopilotRouter');
const { attachOpenAIRealtimeProxy } = require('./openaiRealtimeProxy');

// --- Import Gemini Routers ---
const geminiAutopilotRouter = require('./routes/geminiAutopilotRouter');
const geminiLiveTokenRouter = require('./routes/geminiLiveTokenRouter');
const geminiVisionRouter = require('./routes/geminiVisionRouter');

// --- Import New Routers ---
const playbookRouter = require('./routes/playbookRouter');
const journalRouter = require('./routes/journalRouter');
const performanceRouter = require('./routes/performanceRouter'); 
const ttsRouter = require('./routes/ttsRouter');
const { router: deskRouter } = require('./routes/deskRouter'); 
const deskPolicyRouter = require('./routes/deskPolicyRouter');
const modelPolicyRouter = require('./routes/modelPolicyRouter');
const sessionRouter = require('./routes/sessionRouter');

// Phase 2: Orchestrator
const { handleAgentRequest } = require('./agents/orchestrator');

// Dynamic Agents
const {
  getAgents,
  updateAgentConfig,
  createAgent,
  deleteAgent
} = require('./agents/agents');

// Broker State Store & TradeLocker Client
const {
  setBrokerSnapshot,
  getBrokerSnapshot,
  brokerStateStore
} = require('./broker/brokerStateStore');

const {
  fetchTradeLockerSnapshot,
  placeOrder,
  closePosition,
  modifyPosition,
} = require('./broker/tradelockerClient');

// Poller
const { startTradeLockerPolling } = require('./broker/tradelockerPoller');

// Phase 4: Autopilot & Risk
const { 
  handleAutopilotProposedTrade,
  handleAutopilotExecutionPlan 
} = require('./risk/autopilotController');

const { calculateTradeParameters } = require('./risk/riskEngine');

const {
  executeAutopilotTradeSim,
  getSimAccount,
  getSimPositions,
  closeSimPosition,
} = require('./autopilot/simExecutor');

// Phase 4.5: Autopilot Execution
const { executeTradeCommand } = require('./autopilot/executionEngine');

// Phase 5: Round-table & History
const { runTradingRoundTable } = require('./roundtable/roundTableEngine');
const {
  appendAutopilotHistory,
  getSimilarAutopilotHistory,
} = require('./history/autopilotHistoryStore');
const { runAutopilotCoach } = require('./history/autopilotCoach');

const { analyzeChartImage } = require('./vision/visionService');
const { visionRouter } = require('./visionRouter');

// --- GLOBAL SERVER CRASH PROTECTION ---
process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION - Server would have crashed', err);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('UNHANDLED REJECTION', { reason });
});

const app = express();
const PORT = process.env.PORT || 4000;
const ACCESS_CODE = process.env.ACCESS_CODE || 'admin123';

const server = http.createServer(app);

// Attach the WS relay BEFORE listen()
attachOpenAIRealtimeProxy(server);

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
app.use('/api/agent-router', aiLimiter);
app.use('/api/risk/', aiLimiter); 
app.use('/api/autopilot/', aiLimiter); 
app.use('/api/roundtable/', aiLimiter); 
app.use('/api/vision/', aiLimiter); 
app.use('/api/history/', aiLimiter);
app.use('/api/openai/', aiLimiter);
app.use('/api/gemini/', aiLimiter);
app.use('/api/playbooks', aiLimiter);
app.use('/api/journal', journalRouter);
app.use('/api/performance', performanceRouter); 
app.use('/api/desk/policy', deskPolicyRouter); 
app.use('/api/model-policy', modelPolicyRouter); 
app.use('/api/session', sessionRouter);
app.use('/api/tools/', aiLimiter);
app.use('/api/desk/', aiLimiter);

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || true, 
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-openai-key', 'x-gemini-key']
  })
);

app.use(express.json({ limit: '10mb' }));

// --- CLIENT LOGGING ENDPOINT ---
app.post('/api/log', (req, res) => {
  const { level, message, meta } = req.body;
  if (level === 'ERROR') {
    logger.error(`[CLIENT] ${message}`, meta);
  } else if (level === 'WARN') {
    logger.warn(`[CLIENT] ${message}`, meta);
  } else {
    logger.info(`[CLIENT] ${message}`, meta);
  }
  res.status(200).send('Logged');
});

// ---------- AI Squad Tool Endpoints ----------

// GET /api/tools/playbooks
const playbookService = require('./services/playbookService');
app.get("/api/tools/playbooks", async (req, res) => {
  try {
    const { symbol, timeframe, direction } = req.query;
    // Map query to filter object
    const filter = {};
    if (symbol) filter.symbol = symbol;
    if (timeframe) filter.timeframe = timeframe;
    
    const result = await playbookService.listPlaybooks(filter);

    res.json({
      ok: true,
      count: result.length,
      playbooks: result,
    });
  } catch (err) {
    console.error("Error in /api/tools/playbooks", err);
    res.status(500).json({
      ok: false,
      error: "Failed to fetch playbooks",
    });
  }
});

// Tool wrapper for old endpoints to new journal service (compatibility)
app.post("/api/tools/journal-entry", async (req, res) => {
  try {
    const payload = req.body || {};
    // Map legacy fields to new service
    const entry = await require('./services/journalService').logEntry({
       ...payload,
       source: 'ai'
    });
    res.json({ ok: true, entry });
  } catch (err) {
    console.error("Error in /api/tools/journal-entry", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/tools/autopilot-proposal
app.post("/api/tools/autopilot-proposal", (req, res) => {
  try {
    const payload = req.body || {};
    const proposal = calculateTradeParameters(payload);
    res.json({
      ok: proposal.riskEngine?.status !== "review",
      proposal,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Mount Vision Router
app.use('/api/vision', visionRouter);

// Mount OpenAI Routers
app.use('/api/openai', openaiRealtimeRouter);
app.use('/api/openai', openaiAutopilotRouter);

// Mount Gemini Routers
app.use('/api/gemini', geminiAutopilotRouter);
app.use('/api/gemini', geminiLiveTokenRouter);
app.use('/api/gemini', geminiVisionRouter);

// Mount New Routers
app.use('/api/playbooks', playbookRouter);
app.use('/api', ttsRouter); 
app.use('/api/desk', deskRouter); 

// --- AUTH ROUTE ---
app.post('/api/auth/verify', (req, res) => {
  const { code } = req.body;
  if (code === ACCESS_CODE) {
    logger.info('Access code verified successfully.');
    res.json({ ok: true });
  } else {
    logger.warn('Invalid access code attempt.');
    res.status(401).json({ error: 'Invalid access code' });
  }
});

// --- PROXY ROUTE ---
app.get('/api/proxy', async (req, res, next) => {
  try {
    const targetUrl = req.query.url;
    if (!targetUrl) return next(new AppError('Missing url param', 400));

    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const contentType = response.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);

    if (contentType && contentType.includes('text/html')) {
      let html = await response.text();
      const baseTag = `<base href="${targetUrl}">`;
      html = html.replace('<head>', `<head>${baseTag}`);
      res.send(html);
    } else {
      const buffer = await response.arrayBuffer();
      res.send(Buffer.from(buffer));
    }
  } catch (err) {
    next(new AppError(`Proxy Error: ${err.message}`, 502));
  }
});

// ------------------------------
// Broker snapshot API
// ------------------------------
app.get('/api/broker/snapshot', async (req, res, next) => {
  try {
    let snapshot = brokerStateStore.getSnapshot();

    if (!snapshot) {
      // If we have creds, try to fetch fresh one
      if (process.env.TRADELOCKER_EMAIL) {
          try {
            snapshot = await fetchTradeLockerSnapshot();
            brokerStateStore.updateSnapshot(snapshot);
          } catch(e) { /* ignore if not connected */ }
      }
    }

    res.json({ ok: true, snapshot });
  } catch (err) {
    next(err);
  }
});

app.post('/api/broker/snapshot', (req, res, next) => {
  try {
    const payload = req.body || {};
    const snapshot = setBrokerSnapshot('default', payload);
    res.json(snapshot);
  } catch (err) {
    next(err);
  }
});

// ------------------------------
// Broker Compatibility Adapter (CRITICAL FIX)
// ------------------------------
app.get('/api/tradelocker/overview', (req, res) => {
    // Adapter to map brokerStateStore to the old BrokerAccountInfo shape
    const snapshot = brokerStateStore.getSnapshot();
    
    if (!snapshot) {
        return res.json({ isConnected: false, positions: [] });
    }

    const data = {
        isConnected: true,
        balance: snapshot.balance,
        equity: snapshot.equity,
        marginUsed: snapshot.marginUsed,
        positions: snapshot.openPositions || [],
        recentEvents: [] 
    };
    
    res.json(data);
});

// ------------------------------
// Broker controls API
// ------------------------------
app.post('/api/broker/controls', async (req, res, next) => {
  const { action, payload } = req.body || {};

  if (!action) {
    return next(new AppError('Body must include "action".', 400));
  }

  try {
    let result = null;

    switch (action) {
      case 'place-order': {
        result = await placeOrder(payload || {});
        break;
      }
      case 'close-position': {
        const { positionId, qty } = payload || {};
        if (!positionId && positionId !== 0) throw new AppError('close-position requires payload.positionId', 400);
        const q = qty === undefined || qty === null ? 0 : Number(qty);
        result = await closePosition(positionId, q);
        break;
      }
      case 'modify-position': {
        const { positionId, slPrice, tpPrice } = payload || {};
        if (!positionId && positionId !== 0) throw new AppError('modify-position requires payload.positionId', 400);
        const params = {};
        if ('slPrice' in (payload || {})) params.slPrice = slPrice === null ? null : Number(slPrice);
        if ('tpPrice' in (payload || {})) params.tpPrice = tpPrice === null ? null : Number(tpPrice);
        result = await modifyPosition(positionId, params);
        break;
      }
      default:
        return next(new AppError(`Unsupported action "${action}".`, 400));
    }

    try {
      const snapshot = await fetchTradeLockerSnapshot();
      brokerStateStore.updateSnapshot(snapshot);
    } catch (snapErr) {
      logger.warn('[API] /api/broker/controls – failed to refresh snapshot:', snapErr.message);
    }

    res.json({ ok: true, action, result });
  } catch (err) {
    next(err);
  }
});

// ------------------------------
// Agent settings / model routing
// ------------------------------

app.get('/api/agents', (req, res, next) => {
  try {
    const list = getAgents();
    res.json({ agents: list });
  } catch (err) {
    next(err);
  }
});

app.post('/api/agents/:id', (req, res, next) => {
  try {
    const id = req.params.id;
    const { provider, model } = req.body || {};

    const patch = {};
    if (provider) patch.provider = provider;
    if (model) patch.model = model;

    if (!Object.keys(patch).length) {
      return next(new AppError('Nothing to update (provider/model missing).', 400));
    }

    const updated = updateAgentConfig(id, patch);
    if (!updated) {
      return next(new AppError(`Agent ${id} not found.`, 404));
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

app.post('/api/agents', (req, res, next) => {
  try {
    const { id, displayName, role, provider, model, capabilities } = req.body || {};

    if (!id || !displayName || !role) {
      return next(new AppError('id, displayName, and role are required.', 400));
    }

    let caps = [];
    if (Array.isArray(capabilities)) {
      caps = capabilities.map((c) => String(c));
    }

    const agent = createAgent({
      id,
      displayName,
      role,
      provider,
      model,
      capabilities: caps,
    });

    res.json(agent);
  } catch (err) {
    if (err.code === 'Conflict') return next(new AppError(err.message, 409));
    next(err);
  }
});

app.delete('/api/agents/:id', (req, res, next) => {
  try {
    const id = req.params.id;
    let removed;
    try {
      removed = deleteAgent(id);
    } catch (err) {
      if (err.code === 'Protected') return next(new AppError(err.message, 400));
      throw err;
    }

    if (!removed) return next(new AppError(`Agent ${id} not found.`, 404));

    res.json({ ok: true, removedId: id });
  } catch (err) {
    next(err);
  }
});

// Mount Agents router
app.use(createAgentsRouter(db));

// --- LEGACY AI ROUTE ---
app.post('/api/ai/route', async (req, res, next) => {
  try {
    const result = await handleAiRoute(req.body, db);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// --- AGENT ROUTER ---
app.post('/api/agent-router', async (req, res, next) => {
  try {
    const { agentId, userMessage, sessionState, history, deskState } = req.body || {};
    const result = await handleAgentRequest({ agentId, userMessage, sessionState, history, deskState }, db);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// --- AUTOPILOT & RISK ROUTES ---
app.post('/api/risk/preview-trade', async (req, res, next) => {
  try {
    const { sessionState, proposedTrade } = req.body || {};
    const result = await handleAutopilotProposedTrade(sessionState, proposedTrade);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post('/api/autopilot/plan-trade', async (req, res, next) => {
  try {
    const { sessionState, proposedTrade } = req.body || {};
    if (!sessionState || !proposedTrade) {
      return next(new AppError("Missing sessionState or proposedTrade", 400));
    }
    const result = await handleAutopilotExecutionPlan(sessionState, proposedTrade);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// --- AUTOPILOT EXECUTION ---
app.post('/api/autopilot/execute', async (req, res, next) => {
  try {
    const { mode, source, command } = req.body || {};

    if (!command || !command.type) {
      return next(new AppError('Body must include "command" with a valid "type" field.', 400));
    }

    const useMode = mode === 'auto' || mode === 'confirm' ? mode : 'confirm';

    const result = await executeTradeCommand({
      mode: useMode,
      command,
      source: source || 'api',
    });

    res.json({ ok: true, mode: useMode, result });
  } catch (err) {
    next(err);
  }
});

// --- ROUND TABLE ---
app.post('/api/autopilot/plan-from-roundtable', async (req, res, next) => {
  try {
    const { sessionState, userQuestion, visualSummary } = req.body || {};

    if (!sessionState) {
      return next(new AppError('sessionState is required.', 400));
    }

    const result = await runTradingRoundTable({
      sessionState,
      userQuestion: userQuestion || '',
      visualSummary: typeof visualSummary === 'string' ? visualSummary : null,
    });

    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

// --- HISTORY & COACHING ---
app.post('/api/history/autopilot/log', (req, res, next) => {
  try {
    const { entry, sessionState } = req.body || {};
    if (!entry || !sessionState) {
      return next(new AppError('entry and sessionState are required.', 400));
    }
    const rec = appendAutopilotHistory(entry, sessionState);
    res.json(rec);
  } catch (err) {
    next(err);
  }
});

app.post('/api/history/autopilot/coach', async (req, res, next) => {
  try {
    const { sessionState } = req.body || {};
    if (!sessionState) {
      return next(new AppError('sessionState is required.', 400));
    }

    const result = await runAutopilotCoach(sessionState);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// --- VISION ANALYSIS ---
app.post('/api/vision/analyze', async (req, res, next) => {
  try {
    // Legacy support for ChartVisionAgentPanel direct calls if still used
    // New router handles this, but if older components call this directly
    const { fileBase64, mimeType, question } = req.body;
    
    if (!fileBase64) return next(new AppError("Missing fileBase64", 400));

    const summary = await analyzeChartImage({ fileBase64, mimeType: mimeType || 'image/jpeg', question, sessionState: {} });
    res.json({ visionSummary: summary });
  } catch (err) {
    next(err);
  }
});

// --- SIM BROKER API ---
app.get('/api/broker/sim/account', (_req, res, next) => {
  try {
    const account = getSimAccount();
    res.json(account);
  } catch (err) {
    next(err);
  }
});

app.get('/api/broker/sim/positions', (_req, res, next) => {
  try {
    const positions = getSimPositions();
    res.json(positions);
  } catch (err) {
    next(err);
  }
});

app.post('/api/broker/sim/close-position', (req, res, next) => {
  try {
    const { positionId, closePrice } = req.body || {};
    if (!positionId || typeof closePrice !== 'number') {
      return next(new AppError('positionId and closePrice are required.', 400));
    }
    const pos = closeSimPosition(positionId, closePrice);
    res.json(pos);
  } catch (err) {
    next(err);
  }
});

app.post('/api/autopilot/execute-plan-sim', async (req, res, next) => {
  try {
    const { sessionState, tradeRequest, executionParams } = req.body || {};
    const result = await executeAutopilotTradeSim(sessionState, tradeRequest, executionParams);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// --- TRADELOCKER PROXY ---
app.post('/api/tradelocker/login', async (req, res, next) => {
  const { email, password, server, isDemo } = req.body || {};
  if (!email || !password || !server) return next(new AppError('Missing email, password or server', 400));

  const baseUrl = isDemo ? 'https://demo.tradelocker.com/backend-api' : 'https://live.tradelocker.com/backend-api';

  try {
    const authRes = await fetch(`${baseUrl}/auth/jwt/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, server })
    });

    if (!authRes.ok) {
      const errorText = await authRes.text();
      return next(new AppError(errorText || 'Failed to authenticate with TradeLocker', authRes.status));
    }

    const authJson = await authRes.json();
    const accessToken = authJson.accessToken || authJson.access_token;

    if (!accessToken) return next(new AppError('TradeLocker did not return an access token', 500));

    const accountsRes = await fetch(`${baseUrl}/auth/jwt/all-accounts`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!accountsRes.ok) {
      const errorText = await accountsRes.text();
      return next(new AppError(errorText || 'Failed to fetch TradeLocker accounts', accountsRes.status));
    }

    const accountsJson = await accountsRes.json();
    const accountsRaw = Array.isArray(accountsJson) ? accountsJson : accountsJson.accounts || [];

    if (!accountsRaw.length) return next(new AppError('No TradeLocker accounts found for this user', 400));

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
      accountId,
      accNum,
      createdAt: Date.now(),
      isDemo: !!isDemo,
      email,
      server,
      accounts
    };

    await db.setSession(sessionId, sessionData);
    
    // Init journal if needed
    const currentJournal = await db.getJournal(sessionId);
    if (currentJournal.length === 0) await db.setJournal(sessionId, []);

    res.json({ sessionId, accounts, accountId, accNum });
  } catch (err) {
    next(err);
  }
});

// --- LAST: Global Error Handler ---
app.use(globalErrorHandler);

// --- 404 Handler ---
app.all('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
  }
  const clientDistPath = path.join(__dirname, '..', 'dist');
  if (fs.existsSync(clientDistPath)) {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  } else {
    res.status(404).send('Not found');
  }
});

setupMarketData(server);
startTradeLockerPolling(null);

server.listen(PORT, () => {
  console.log(`AI Trading Analyst Backend (Protected) listening on port ${PORT}`);
});

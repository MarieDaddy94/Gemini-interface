const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;
const LOG_FILE = path.join(__dirname, 'playbooks-log.json');

// In-memory session store: sessionId -> TradeLocker session info
const sessions = new Map();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true
  })
);

app.use(express.json());

// --- Playbook Logging Logic (Merged) ---
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
  // Official base URLs per TradeLocker docs
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
      console.error('TradeLocker auth error:', errorText);
      return res.status(authRes.status).send(errorText || 'Failed to authenticate with TradeLocker');
    }

    const authJson = await authRes.json();
    const accessToken = authJson.accessToken || authJson.access_token;
    const refreshToken = authJson.refreshToken || authJson.refresh_token;

    if (!accessToken) {
      return res.status(500).send('TradeLocker did not return an access token');
    }

    // 2) List accounts to get accNum + accountId
    const accountsRes = await fetch(`${baseUrl}/auth/jwt/all-accounts`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!accountsRes.ok) {
      const errorText = await accountsRes.text();
      return res.status(accountsRes.status).send(errorText || 'Failed to fetch TradeLocker accounts');
    }

    const accountsJson = await accountsRes.json();
    const accounts = Array.isArray(accountsJson) ? accountsJson : accountsJson.accounts || [];

    if (!accounts.length) {
      return res.status(400).send('No TradeLocker accounts found for this user');
    }

    const primary = accounts[0];
    const accountId = String(primary.accountId ?? primary.id ?? primary.account_id);
    const accNum = Number(primary.accNum ?? primary.acc_num ?? 1);

    // 3) Create local session
    const sessionId = crypto.randomUUID();

    sessions.set(sessionId, {
      baseUrl,
      accessToken,
      refreshToken,
      accountId,
      accNum,
      createdAt: Date.now(),
      isDemo: !!isDemo,
      email,
      server
    });

    res.json({ sessionId, accountId, accNum });
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
  const session = sessions.get(sessionId);
  if (!session) {
    res.status(401).send('Unknown or expired sessionId');
    return null;
  }
  return session;
}

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

    if (!stateRes.ok) return res.status(stateRes.status).send('Failed to fetch account state');
    if (!positionsRes.ok) return res.status(positionsRes.status).send('Failed to fetch positions');

    const stateJson = await stateRes.json();
    const positionsJson = await positionsRes.json();

    const balance = stateJson.balance ?? stateJson.Balance ?? stateJson.accountBalance ?? 0;
    const equity = stateJson.equity ?? stateJson.Equity ?? stateJson.accountEquity ?? balance;
    const marginUsed = stateJson.marginUsed ?? stateJson.margin ?? stateJson.Margin ?? 0;

    const rawPositions = Array.isArray(positionsJson) ? positionsJson : positionsJson.positions || positionsJson.data || [];

    const positions = rawPositions.map((p) => {
      const sideRaw = (p.side ?? p.positionSide ?? p.direction ?? '').toString().toLowerCase();
      const side = sideRaw.includes('sell') || sideRaw.includes('short') ? 'sell' : 'buy';
      const symbol = p.symbol ?? p.instrument ?? p.symbolName ?? 'UNKNOWN';
      const size = p.volume ?? p.lots ?? p.positionVolume ?? 0;
      const entryPrice = p.openPrice ?? p.priceOpen ?? p.entryPrice ?? p.price ?? 0;
      const currentPrice = p.currentPrice ?? p.priceCurrent ?? p.closePrice ?? p.lastPrice ?? entryPrice;
      const pnl = p.unrealizedPnL ?? p.unrealisedPnl ?? p.pnl ?? p.profit ?? 0;

      return {
        id: String(p.positionId ?? p.id ?? `${symbol}-${entryPrice}-${currentPrice}`),
        symbol,
        side,
        size: Number(size),
        entryPrice: Number(entryPrice),
        currentPrice: Number(currentPrice),
        pnl: Number(pnl)
      };
    });

    const overview = {
      isConnected: true,
      balance: Number(balance),
      equity: Number(equity),
      marginUsed: Number(marginUsed),
      positions
    };

    res.json(overview);
  } catch (err) {
    console.error('TradeLocker overview fatal error', err);
    res.status(500).send('Internal error while fetching broker data');
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, sessions: sessions.size });
});

app.listen(PORT, () => {
  console.log(`Backend server (TradeLocker Proxy + Playbook Logs) listening on http://localhost:${PORT}`);
  console.log(`Playbook log file: ${LOG_FILE}`);
});
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;
const LOG_FILE = path.join(__dirname, 'playbooks-log.json');

// In-memory session store: sessionId -> TradeLocker session info + accounts
const sessions = new Map();
// In-memory journaling store: sessionId -> JournalEntry[]
const journalBySession = new Map();

/**
 * For demo: allow your frontend origin.
 * Change origin to match where your React app runs (e.g. http://localhost:5173 or http://localhost:3000).
 */
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true
  })
);

app.use(express.json());

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
 * Body: { email, password, server, isDemo }
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
      console.error('TradeLocker accounts error:', errorText);
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

    sessions.set(sessionId, {
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
      lastPositionsById: {} // id -> { id, symbol, pnl }
    });

    // Initialize empty journal for this session
    journalBySession.set(sessionId, []);

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
  const session = sessions.get(sessionId);
  if (!session) {
    res.status(401).send('Unknown or expired sessionId');
    return null;
  }
  return session;
}

/**
 * POST /api/tradelocker/select-account
 * Body: { sessionId, accountId, accNum }
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

  res.json({
    ok: true,
    accountId: session.accountId,
    accNum: session.accNum
  });
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
      const errorText = await stateRes.text();
      console.error('TradeLocker state error:', errorText);
      return res
        .status(stateRes.status)
        .send(errorText || 'Failed to fetch account state');
    }

    if (!positionsRes.ok) {
      const errorText = await positionsRes.text();
      console.error('TradeLocker positions error:', errorText);
      return res
        .status(positionsRes.status)
        .send(errorText || 'Failed to fetch open positions');
    }

    const stateJson = await stateRes.json();
    const positionsJson = await positionsRes.json();

    const balance =
      stateJson.balance ??
      stateJson.Balance ??
      stateJson.accountBalance ??
      0;

    const equity =
      stateJson.equity ??
      stateJson.Equity ??
      stateJson.accountEquity ??
      balance;

    const marginUsed =
      stateJson.marginUsed ??
      stateJson.margin ??
      stateJson.Margin ??
      0;

    const rawPositions = Array.isArray(positionsJson)
      ? positionsJson
      : positionsJson.positions || positionsJson.data || [];

    const positions = rawPositions.map((p) => {
      const sideRaw = (
        p.side ??
        p.positionSide ??
        p.direction ??
        ''
      )
        .toString()
        .toLowerCase();

      const side =
        sideRaw.includes('sell') || sideRaw.includes('short') ? 'sell' : 'buy';

      const symbol = p.symbol ?? p.instrument ?? p.symbolName ?? 'UNKNOWN';

      const size = p.volume ?? p.lots ?? p.positionVolume ?? 0;

      const entryPrice =
        p.openPrice ??
        p.priceOpen ??
        p.entryPrice ??
        p.price ??
        0;

      const currentPrice =
        p.currentPrice ??
        p.priceCurrent ??
        p.closePrice ??
        p.lastPrice ??
        entryPrice;

      const pnl =
        p.unrealizedPnL ??
        p.unrealisedPnl ??
        p.pnl ??
        p.profit ??
        0;

      return {
        id: String(
          p.positionId ??
            p.id ??
            `${symbol}-${entryPrice}-${currentPrice}`
        ),
        symbol,
        side,
        size: Number(size),
        entryPrice: Number(entryPrice),
        currentPrice: Number(currentPrice),
        pnl: Number(pnl)
      };
    });

    // === Auto-outcome detection for linked journal entries ===
    const prevPositionsById = session.lastPositionsById || {};
    const currentPositionsById = {};
    for (const pos of positions) {
      currentPositionsById[pos.id] = {
        id: pos.id,
        symbol: pos.symbol,
        pnl: pos.pnl
      };
    }

    const closedIds = Object.keys(prevPositionsById).filter(
      (id) => !currentPositionsById[id]
    );

    if (closedIds.length && journalBySession.has(sessionId)) {
      const list = journalBySession.get(sessionId) || [];
      let changed = false;

      for (const closedId of closedIds) {
        const prev = prevPositionsById[closedId];
        if (!prev) continue;
        const finalPnl = typeof prev.pnl === 'number' ? prev.pnl : 0;

        let outcome = 'BreakEven';
        const threshold = 0.5; // small buffer
        if (finalPnl > threshold) outcome = 'Win';
        else if (finalPnl < -threshold) outcome = 'Loss';

        for (let i = 0; i < list.length; i++) {
          const entry = list[i];
          if (
            entry.linkedPositionId === closedId &&
            entry.outcome === 'Open'
          ) {
            list[i] = {
              ...entry,
              outcome,
              finalPnl,
              closedAt: new Date().toISOString()
            };
            changed = true;
          }
        }
      }

      if (changed) {
        journalBySession.set(sessionId, list);
      }
    }

    session.lastPositionsById = currentPositionsById;

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

/**
 * GET /api/journal/entries?sessionId=...
 */
app.get('/api/journal/entries', (req, res) => {
  const sessionId = req.query.sessionId;
  const session = getSessionOrThrow(sessionId, res);
  if (!session) return;

  const entries = journalBySession.get(sessionId) || [];
  res.json(entries);
});

/**
 * POST /api/journal/entry
 * Body: {
 *   sessionId,
 *   entry: {
 *     focusSymbol,
 *     bias,
 *     confidence,
 *     note,
 *     entryType?: 'Pre-Trade' | 'Post-Trade' | 'SessionReview'
 *     outcome?: 'Open' | 'Win' | 'Loss' | 'BreakEven'
 *     tags?: string[]
 *     accountSnapshot?: { balance, equity, openPnl, positionsCount }
 *     linkedPositionId?: string
 *     linkedSymbol?: string
 *   }
 * }
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

  const linkedPositionId =
    typeof entry.linkedPositionId === 'string' &&
    entry.linkedPositionId.trim().length > 0
      ? entry.linkedPositionId.trim()
      : null;

  const linkedSymbol =
    typeof entry.linkedSymbol === 'string' &&
    entry.linkedSymbol.trim().length > 0
      ? entry.linkedSymbol.trim()
      : null;

  const stored = {
    id,
    timestamp,
    focusSymbol: entry.focusSymbol || 'Unknown',
    bias: entry.bias || 'Neutral',
    confidence:
      typeof entry.confidence === 'number' ? entry.confidence : 3,
    note: entry.note,
    entryType,
    outcome,
    tags,
    accountSnapshot: entry.accountSnapshot || null,
    linkedPositionId,
    linkedSymbol,
    finalPnl: null,
    closedAt: null
  };

  const list = journalBySession.get(sessionId) || [];
  list.unshift(stored);
  journalBySession.set(sessionId, list);

  res.json(stored);
});

/**
 * PATCH /api/journal/entry/:id
 * Body: {
 *   sessionId,
 *   updates: {
 *     outcome?: 'Open' | 'Win' | 'Loss' | 'BreakEven'
 *     tags?: string[]
 *     note?: string
 *     linkedPositionId?: string | null
 *   }
 * }
 */
app.patch('/api/journal/entry/:id', (req, res) => {
  const { sessionId, updates } = req.body || {};
  const entryId = req.params.id;

  const session = getSessionOrThrow(sessionId, res);
  if (!session) return;

  const list = journalBySession.get(sessionId) || [];
  const idx = list.findIndex((e) => e.id === entryId);

  if (idx === -1) {
    return res.status(404).send('Journal entry not found');
  }

  const current = list[idx];
  const next = { ...current };

  if (updates) {
    if (typeof updates.note === 'string') {
      next.note = updates.note;
    }

    if (Array.isArray(updates.tags)) {
      next.tags = updates.tags
        .map((t) => String(t))
        .filter((t) => t.trim().length > 0);
    }

    if (typeof updates.outcome === 'string') {
      const validOutcomes = ['Open', 'Win', 'Loss', 'BreakEven'];
      if (validOutcomes.includes(updates.outcome)) {
        next.outcome = updates.outcome;
      }
    }

    if (updates.hasOwnProperty('linkedPositionId')) {
      if (
        typeof updates.linkedPositionId === 'string' &&
        updates.linkedPositionId.trim().length > 0
      ) {
        next.linkedPositionId = updates.linkedPositionId.trim();
      } else {
        next.linkedPositionId = null;
      }
    }
  }

  list[idx] = next;
  journalBySession.set(sessionId, list);

  res.json(next);
});

// Simple health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, sessions: sessions.size });
});

app.listen(PORT, () => {
  console.log(`TradeLocker proxy API & Playbook Logger listening on http://localhost:${PORT}`);
  console.log(`Playbook log file: ${LOG_FILE}`);
});
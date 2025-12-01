
// server/broker/tradelockerClient.js
//
// Real TradeLocker REST client for:
// - Auth (JWT + accNum resolution)
// - Account snapshot (/trade/accounts/{accountId}/state + /positions)
// - Trading controls: placeOrder, closePosition, modifyPosition
//
// Requires env vars:
//   TRADELOCKER_BASE_URL=https://demo.tradelocker.com/backend-api
//     or https://live.tradelocker.com/backend-api
//   TRADELOCKER_EMAIL=you@example.com
//   TRADELOCKER_PASSWORD=your_password
//   TRADELOCKER_SERVER=YourBroker-ServerName
//   TRADELOCKER_ACCOUNT_ID=123456
//   (optional) TRADELOCKER_ACC_NUM=1
//   (optional) TL_DEVELOPER_API_KEY=...
//
// NOTE: /trade endpoints require Authorization: Bearer <JWT> + accNum header.
// Place order requires: qty, routeId, side, validity, type, tradableInstrumentId
// (price can be 0 for market; stop orders require stopPrice).

const BASE_URL =
  process.env.TRADELOCKER_BASE_URL ||
  'https://demo.tradelocker.com/backend-api';

const EMAIL = process.env.TRADELOCKER_EMAIL;
const PASSWORD = process.env.TRADELOCKER_PASSWORD;
const SERVER = process.env.TRADELOCKER_SERVER;
const ACCOUNT_ID = process.env.TRADELOCKER_ACCOUNT_ID;
let ACC_NUM = process.env.TRADELOCKER_ACC_NUM || null;

const DEV_API_KEY = process.env.TL_DEVELOPER_API_KEY || null;
const DEFAULT_ROUTE_ID = process.env.TRADELOCKER_ROUTE_ID || null;

let accessToken = null;
let refreshToken = null;

/**
 * Build full URL.
 */
function buildUrl(path) {
  if (!path.startsWith('/')) return `${BASE_URL}/${path}`;
  return `${BASE_URL}${path}`;
}

/**
 * Generic JSON fetch.
 */
async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `[TradeLocker] HTTP ${res.status} ${res.statusText} for ${url} – ${text}`,
    );
  }

  if (res.status === 204) return null;
  return res.json();
}

/**
 * Log in via POST /auth/jwt/token.
 */
async function login() {
  if (!EMAIL || !PASSWORD || !SERVER) {
    throw new Error(
      '[TradeLocker] Missing TRADELOCKER_EMAIL/PASSWORD/SERVER env vars.',
    );
  }

  const url = buildUrl('/auth/jwt/token');
  const body = { email: EMAIL, password: PASSWORD, server: SERVER };

  const data = await fetchJson(url, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!data || !data.accessToken) {
    throw new Error(
      '[TradeLocker] Login did not return accessToken. Check credentials.',
    );
  }

  accessToken = data.accessToken;
  refreshToken = data.refreshToken || null;

  console.log('[TradeLocker] Logged in and obtained JWT accessToken.');
}

/**
 * Make sure we have a token.
 */
async function ensureAccessToken() {
  if (!accessToken) {
    await login();
  }
}

/**
 * Discover accNum for the configured ACCOUNT_ID via GET /auth/jwt/all-accounts
 * (unless TRADELOCKER_ACC_NUM was already provided).
 */
async function ensureAccNum() {
  if (ACC_NUM) return;

  if (!ACCOUNT_ID) {
    throw new Error(
      '[TradeLocker] Missing TRADELOCKER_ACCOUNT_ID env var for ensureAccNum.',
    );
  }

  await ensureAccessToken();

  const url = buildUrl('/auth/jwt/all-accounts');
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `[TradeLocker] all-accounts failed: ${res.status} ${res.statusText} – ${text}`,
    );
  }

  const data = await res.json();

  let accountsArray = [];
  if (Array.isArray(data)) {
    accountsArray = data;
  } else if (Array.isArray(data.accounts)) {
    accountsArray = data.accounts;
  }

  const target = accountsArray.find(
    (a) =>
      String(a.accountId) === String(ACCOUNT_ID) ||
      String(a.id) === String(ACCOUNT_ID),
  );

  if (!target) {
    throw new Error(
      `[TradeLocker] Could not find accountId ${ACCOUNT_ID} in all-accounts response.`,
    );
  }

  const accNumCandidate =
    target.accNum ??
    target.accnum ??
    target.accountNumber ??
    target.accountIndex;

  if (!accNumCandidate) {
    throw new Error(
      '[TradeLocker] Found account but no accNum field. Inspect all-accounts JSON manually.',
    );
  }

  ACC_NUM = String(accNumCandidate);
  console.log('[TradeLocker] Resolved accNum =', ACC_NUM);
}

/**
 * Ensure full session (token + accNum).
 */
async function ensureSession() {
  await ensureAccessToken();
  await ensureAccNum();
}

/**
 * Wrapper for /trade/* requests.
 */
async function tradeFetchJson(path, options = {}) {
  await ensureSession();

  const url = buildUrl(path);
  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${accessToken}`,
    accNum: ACC_NUM,
  };

  if (DEV_API_KEY) {
    headers['tl-developer-api-key'] = DEV_API_KEY;
  }

  let res = await fetch(url, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    console.warn(
      '[TradeLocker] 401 from trade endpoint – re-logging and retrying once.',
    );
    accessToken = null;
    await ensureAccessToken();

    headers.Authorization = `Bearer ${accessToken}`;
    res = await fetch(url, {
      ...options,
      headers,
    });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `[TradeLocker] tradeFetchJson HTTP ${res.status} ${res.statusText} – ${text}`,
    );
  }

  if (res.status === 204) return null;
  return res.json();
}

/**
 * Helpers
 */
function toNumber(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalize /trade/accounts/{accountId}/state.
 */
function normalizeAccountState(accountState, accountId) {
  const currency =
    accountState.ccy ||
    accountState.currency ||
    accountState.accountCurrency ||
    'USD';

  const balance =
    toNumber(
      accountState.balance ??
        accountState.balanceValue ??
        accountState.balance_value,
    ) ?? 0;

  const equity =
    toNumber(
      accountState.equity ??
        accountState.equityValue ??
        accountState.equity_value,
    ) ?? balance;

  const marginUsed =
    toNumber(
      accountState.marginUsed ??
        accountState.margin_used ??
        accountState.margin,
    ) ?? 0;

  const marginAvailable =
    toNumber(
      accountState.marginAvailable ??
        accountState.margin_available ??
        accountState.freeMargin ??
        accountState.free_margin,
    ) ?? equity - marginUsed;

  const marginLevel =
    toNumber(
      accountState.marginLevel ?? accountState.margin_level ?? null,
    ) ?? null;

  const dailyPnl =
    toNumber(
      accountState.dailyPnl ??
        accountState.daily_pnl ??
        accountState.pnlToday ??
        accountState.pnl_today,
    ) ?? 0;

  const dailyDrawdown =
    toNumber(
      accountState.dailyDrawdown ??
        accountState.daily_drawdown ??
        accountState.maxDrawdownToday ??
        accountState.max_drawdown_today,
    ) ??
    (dailyPnl < 0 ? dailyPnl : 0);

  return {
    broker: 'TradeLocker',
    accountId: String(accountId),
    currency,
    balance,
    equity,
    marginUsed,
    marginAvailable,
    marginLevel,
    dailyPnl,
    dailyDrawdown,
    rawState: accountState,
  };
}

/**
 * Normalize /trade/accounts/{accountId}/positions.
 */
function normalizePositions(positionsRaw) {
  let list = [];

  if (Array.isArray(positionsRaw)) {
    list = positionsRaw;
  } else if (positionsRaw && Array.isArray(positionsRaw.positions)) {
    list = positionsRaw.positions;
  } else if (positionsRaw && Array.isArray(positionsRaw.data)) {
    list = positionsRaw.data;
  }

  return list.map((p) => {
    const id = String(
      p.positionId ?? p.id ?? p.position_id ?? p.tradeId ?? p.trade_id,
    );

    const instrumentId =
      p.tradableInstrumentId ??
      p.instrumentId ??
      p.instrument_id ??
      null;

    const symbol =
      p.symbolName ??
      p.symbol ??
      p.instrument ??
      p.instrumentName ??
      null;

    const sideRaw = p.side ?? p.direction ?? p.positionSide ?? '';
    const side =
      String(sideRaw).toUpperCase() === 'BUY' ||
      String(sideRaw).toUpperCase() === 'LONG'
        ? 'LONG'
        : String(sideRaw).toUpperCase() === 'SELL' ||
          String(sideRaw).toUpperCase() === 'SHORT'
        ? 'SHORT'
        : String(sideRaw).toUpperCase();

    const size =
      toNumber(p.quantity ?? p.volume ?? p.qty ?? p.lots) ?? 0;

    const entryPrice =
      toNumber(p.avgOpenPrice ?? p.openPrice ?? p.entryPrice) ?? null;

    const stopLoss =
      toNumber(p.slPrice ?? p.stopLoss ?? p.stop_loss ?? null) ??
      null;

    const takeProfit =
      toNumber(p.tpPrice ?? p.takeProfit ?? p.take_profit ?? null) ??
      null;

    const unrealizedPnl =
      toNumber(
        p.unrealizedPnl ??
          p.unrealized_pnl ??
          p.unrealizedPnlInAccountCurrency ??
          p.unrealized_pnl_account,
      ) ?? 0;

    return {
      id,
      instrumentId,
      symbol,
      side,
      size,
      entryPrice,
      stopLoss,
      takeProfit,
      unrealizedPnl,
      raw: p,
    };
  });
}

/**
 * High-level: fetch a full snapshot (state + positions).
 */
async function fetchTradeLockerSnapshot() {
  if (!ACCOUNT_ID) {
    throw new Error(
      '[TradeLocker] Missing TRADELOCKER_ACCOUNT_ID for snapshot.',
    );
  }

  await ensureSession();

  const state = await tradeFetchJson(
    `/trade/accounts/${ACCOUNT_ID}/state`,
    { method: 'GET' },
  );

  const positions = await tradeFetchJson(
    `/trade/accounts/${ACCOUNT_ID}/positions`,
    { method: 'GET' },
  );

  const account = normalizeAccountState(state, ACCOUNT_ID);
  const normalizedPositions = normalizePositions(positions);

  const netUnrealizedPnl = normalizedPositions.reduce(
    (sum, p) => sum + (p.unrealizedPnl || 0),
    0,
  );

  const openRisk = normalizedPositions.reduce((sum, p) => {
    if (!p.stopLoss || !p.entryPrice || !p.size) return sum;
    const distance =
      p.side === 'LONG'
        ? p.entryPrice - p.stopLoss
        : p.stopLoss - p.entryPrice;
    const risk = distance * p.size;
    return sum + (risk > 0 ? risk : 0);
  }, 0);

  return {
    ...account,
    openPositions: normalizedPositions,
    netUnrealizedPnl,
    openRisk,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Place a new order via POST /trade/accounts/{accountId}/orders.
 *
 * @param {Object} params
 * @param {number} params.tradableInstrumentId
 * @param {number} params.qty
 * @param {"BUY"|"SELL"} params.side
 * @param {"market"|"limit"|"stop"} params.type
 * @param {"IOC"|"GTC"} params.validity
 * @param {number} [params.price]       // 0 or omitted for market
 * @param {number} [params.stopPrice]   // required for stop orders
 * @param {number} [params.slPrice]
 * @param {number} [params.tpPrice]
 * @param {number|string} [params.routeId] // falls back to env TRADELOCKER_ROUTE_ID
 * @param {string} [params.clientOrderId]
 */
async function placeOrder(params) {
  if (!ACCOUNT_ID) {
    throw new Error(
      '[TradeLocker] TRADELOCKER_ACCOUNT_ID not set for placeOrder.',
    );
  }

  await ensureSession();

  const {
    tradableInstrumentId,
    qty,
    side,
    type,
    validity,
    price = 0,
    stopPrice,
    slPrice,
    tpPrice,
    routeId,
    clientOrderId,
  } = params;

  const resolvedRouteId = routeId ?? DEFAULT_ROUTE_ID;
  if (!resolvedRouteId) {
    throw new Error(
      '[TradeLocker] routeId missing. Provide routeId param or TRADELOCKER_ROUTE_ID env var.',
    );
  }

  const body = {
    tradableInstrumentId: Number(tradableInstrumentId),
    qty: Number(qty),
    side: String(side).toUpperCase(), // "BUY" or "SELL"
    type: String(type).toLowerCase(), // "market" | "limit" | "stop"
    validity: validity, // "IOC" | "GTC"
    routeId: Number(resolvedRouteId),
    price: Number(price) || 0,
  };

  if (stopPrice != null) {
    body.stopPrice = Number(stopPrice);
  }
  if (slPrice != null) {
    body.slPrice = Number(slPrice);
  }
  if (tpPrice != null) {
    body.tpPrice = Number(tpPrice);
  }
  if (clientOrderId) {
    body.clientOrderId = String(clientOrderId);
  }

  const result = await tradeFetchJson(
    `/trade/accounts/${ACCOUNT_ID}/orders`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );

  return result;
}

/**
 * Close or partially close a position via DELETE /trade/positions/{positionId}.
 *
 * If qty = 0 → close full position.
 * If qty > 0 → close that many lots.
 *
 * @param {string|number} positionId
 * @param {number} qty
 */
async function closePosition(positionId, qty = 0) {
  await ensureSession();

  const pid = String(positionId);
  const q = Number(qty);

  // API uses `qty` parameter (per docs). We pass as query string.
  const path = `/trade/positions/${encodeURIComponent(
    pid,
  )}?qty=${encodeURIComponent(q)}`;

  const result = await tradeFetchJson(path, {
    method: 'DELETE',
  });

  return result;
}

/**
 * Modify an existing position's SL and/or TP via PATCH /trade/positions/{positionId}.
 *
 * To remove SL/TP set their value to null.
 *
 * @param {string|number} positionId
 * @param {Object} params
 * @param {number|null} [params.slPrice]
 * @param {number|null} [params.tpPrice]
 */
async function modifyPosition(positionId, params) {
  await ensureSession();

  const pid = String(positionId);
  const body = {};

  if ('slPrice' in params) {
    body.slPrice =
      params.slPrice === null ? null : Number(params.slPrice);
  }
  if ('tpPrice' in params) {
    body.tpPrice =
      params.tpPrice === null ? null : Number(params.tpPrice);
  }

  const result = await tradeFetchJson(
    `/trade/positions/${encodeURIComponent(pid)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  );

  return result;
}

module.exports = {
  fetchTradeLockerSnapshot,
  placeOrder,
  closePosition,
  modifyPosition,
};


import {
  TradeLockerCredentials,
  BrokerAccountInfo,
  TradeLockerAccountSummary,
  TradeOrderRequest
} from '../types';

// Backend base URL. If you're using Vite, set VITE_API_BASE_URL in .env
// Fallback is http://localhost:4000 where the Express server runs.
const API_BASE_URL =
  (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000';

// Helper: Wraps fetch to catch "Failed to fetch" (network errors) and give a helpful message
async function safeFetch(url: string, options?: RequestInit): Promise<Response> {
  try {
    const res = await fetch(url, options);
    return res;
  } catch (error: any) {
    console.error("API Connection Error:", error);
    // Detect typical network failure messages (backend down, CORS, etc.)
    if (error.name === 'TypeError' || error.message.includes('Failed to fetch')) {
      throw new Error(
        `Could not connect to backend server at ${API_BASE_URL}.\n\n` +
        `1. Ensure the Node.js server is running (cd server && npm run dev).\n` +
        `2. If running in cloud, check VITE_API_BASE_URL.`
      );
    }
    throw error;
  }
}

export interface ConnectResult {
  sessionId: string;
  accounts: TradeLockerAccountSummary[];
  accountId: string;
  accNum: number;
}

/**
 * Connects to your backend, which:
 *  - logs into TradeLocker
 *  - fetches accounts
 *  - stores JWT + account info in memory
 * Returns a sessionId + list of accounts for the frontend.
 */
export const connectToTradeLocker = async (
  creds: TradeLockerCredentials
): Promise<ConnectResult> => {
  const res = await safeFetch(`${API_BASE_URL}/api/tradelocker/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      email: creds.email,
      password: creds.password,
      server: creds.server,
      isDemo: !!creds.isDemo
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || 'Failed to connect to TradeLocker');
  }

  const data = (await res.json()) as {
    sessionId: string;
    accounts: TradeLockerAccountSummary[];
    accountId: string;
    accNum: number;
  };

  return data;
};

/**
 * Switch active account for this session.
 */
export const selectTradeLockerAccount = async (
  sessionId: string,
  accountId: string,
  accNum: number
): Promise<void> => {
  const res = await safeFetch(`${API_BASE_URL}/api/tradelocker/select-account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ sessionId, accountId, accNum })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || 'Failed to select TradeLocker account');
  }
};

/**
 * Polls the backend for the current broker state (balance, equity, positions…)
 * using the opaque sessionId returned by connectToTradeLocker.
 */
export const fetchBrokerData = async (
  sessionId: string
): Promise<BrokerAccountInfo> => {
  const res = await safeFetch(
    `${API_BASE_URL}/api/tradelocker/overview?sessionId=${encodeURIComponent(
      sessionId
    )}`,
    {
      method: 'GET',
      credentials: 'include'
    }
  );

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || 'Failed to fetch broker data');
  }

  const data = (await res.json()) as BrokerAccountInfo;
  return data;
};

/**
 * Executes a trade (or simulated trade) via the backend.
 */
export const executeTrade = async (
  order: TradeOrderRequest
): Promise<{ ok: boolean; orderId?: string; entryPrice?: number }> => {
  const res = await safeFetch(`${API_BASE_URL}/api/tradelocker/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(order)
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || 'Failed to execute order');
  }

  return await res.json();
};

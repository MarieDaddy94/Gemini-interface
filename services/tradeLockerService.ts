import { TradeLockerCredentials, BrokerAccountInfo } from '../types';

// Backend base URL. If you're using Vite, you can set VITE_API_BASE_URL in .env
// Fallback is http://localhost:4000 where the Express server runs.
const API_BASE_URL =
  (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000';

/**
 * Connects to the backend, which:
 *  - logs into TradeLocker
 *  - fetches accounts
 *  - stores JWT + account info in memory
 * Returns a sessionId that the frontend will use when polling broker data.
 */
export const connectToTradeLocker = async (
  creds: TradeLockerCredentials
): Promise<string> => {
  const res = await fetch(`${API_BASE_URL}/api/tradelocker/login`, {
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
    accountId: string;
    accNum: number;
  };

  return data.sessionId;
};

/**
 * Polls the backend for the current broker state (balance, equity, positions…)
 * using the opaque sessionId returned by connectToTradeLocker.
 */
export const fetchBrokerData = async (
  sessionId: string
): Promise<BrokerAccountInfo> => {
  const res = await fetch(
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
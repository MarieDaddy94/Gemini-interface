
import { useCallback, useEffect, useState } from 'react';
import {
  AutopilotMode,
  AutopilotCommand,
  AutopilotExecuteResponse,
  BrokerSnapshot,
} from '../types';

const API_BASE_URL =
  (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${url}`, {
    ...(options || {}),
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`[useAutopilot] ${url} failed: ${res.status} ${res.statusText} – ${text}`);
  }

  return res.json() as Promise<T>;
}

export function useBrokerSnapshot(pollMs: number = 10_000) {
  const [snapshot, setSnapshot] = useState<BrokerSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchJson<{ ok: boolean; snapshot: BrokerSnapshot }>('/api/broker/snapshot');
      if (!data.ok) {
        throw new Error('Snapshot response ok=false');
      }
      setSnapshot(data.snapshot);
    } catch (err: any) {
      // Only log error if not in loading state to avoid spamming console on mount
      // console.error('[useBrokerSnapshot] error:', err);
      setError(err?.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    if (!pollMs) return;

    const id = setInterval(load, pollMs);
    return () => clearInterval(id);
  }, [load, pollMs]);

  return { snapshot, loading, error, reload: load };
}

export interface UseAutopilotExecuteState {
  executing: boolean;
  lastResponse: AutopilotExecuteResponse | null;
  error: string | null;
}

export function useAutopilotExecute() {
  const [executing, setExecuting] = useState(false);
  const [lastResponse, setLastResponse] = useState<AutopilotExecuteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (mode: AutopilotMode, command: AutopilotCommand, source: string = 'ui') => {
      try {
        setExecuting(true);
        setError(null);

        const data = await fetchJson<AutopilotExecuteResponse>('/api/autopilot/execute', {
          method: 'POST',
          body: JSON.stringify({ mode, source, command }),
        });

        if (!data.ok) {
          throw new Error(data as any);
        }

        setLastResponse(data);
        return data;
      } catch (err: any) {
        console.error('[useAutopilotExecute] error:', err);
        setError(err?.message ?? 'Unknown error');
        throw err;
      } finally {
        setExecuting(false);
      }
    },
    [],
  );

  return {
    execute,
    state: {
      executing,
      lastResponse,
      error,
    } as UseAutopilotExecuteState,
  };
}

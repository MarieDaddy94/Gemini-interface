
import { useCallback, useEffect, useState } from 'react';
import {
  AutopilotMode,
  AutopilotCommand,
  AutopilotExecuteResponse,
  BrokerSnapshot,
} from '../types';
import { apiClient } from '../utils/apiClient';
import { logger } from '../services/logger';

export function useBrokerSnapshot(pollMs: number = 10_000) {
  const [snapshot, setSnapshot] = useState<BrokerSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      // Only set loading true if we don't have data yet to avoid UI flicker on polling
      setLoading((prev) => !prev && !snapshot); 
      setError(null);
      const data = await apiClient.get<{ ok: boolean; snapshot: BrokerSnapshot }>('/api/broker/snapshot');
      if (!data.ok) {
        throw new Error('Snapshot response ok=false');
      }
      setSnapshot(data.snapshot);
    } catch (err: any) {
      // GRACEFUL FAILURE: Log error but don't freeze app. 
      // Keep old snapshot if available so UI doesn't blank out.
      logger.error('Failed to fetch broker snapshot', err);
      setError(err?.message ?? 'Connection error');
    } finally {
      setLoading(false);
    }
  }, [snapshot]);

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

        logger.info(`Executing Autopilot Command [${mode}]`, { command, source });

        const data = await apiClient.post<AutopilotExecuteResponse>('/api/autopilot/execute', {
          mode, 
          source, 
          command 
        });

        if (!data.ok) {
          throw new Error('Execute response ok=false'); // Should be caught by apiClient but double check
        }

        setLastResponse(data);
        return data;
      } catch (err: any) {
        logger.error('Autopilot execution failed', err);
        setError(err?.message ?? 'Unknown error');
        // Re-throw so caller can handle UI feedback if needed
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

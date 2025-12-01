
// hooks/useRoundTableAutopilotPlan.ts

import { useCallback, useState } from 'react';
import { AutopilotCommand } from '../types';

export interface RoundTableAgentMessage {
  id: string;
  displayName: string;
  role: string;
  provider: string;
  model: string;
  content: string;
}

export interface RoundTableResult {
  finalSummary: string;
  bias: string;
  executionNotes: string;
  riskNotes: string;
  agents: RoundTableAgentMessage[];
}

export interface RoundTableAutopilotResponse {
  ok: boolean;
  roundTable: RoundTableResult;
  autopilotCommand: AutopilotCommand | null;
}

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
    throw new Error(
      `[useRoundTableAutopilotPlan] ${url} failed: ${res.status} ${res.statusText} – ${text}`,
    );
  }

  return res.json() as Promise<T>;
}

export function useRoundTableAutopilotPlan() {
  const [loading, setLoading] = useState(false);
  const [lastResponse, setLastResponse] =
    useState<RoundTableAutopilotResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (params: {
      sessionState: any;
      userQuestion?: string;
      recentJournal?: any[];
      visualSummary?: string | null;
    }) => {
      try {
        setLoading(true);
        setError(null);

        const data = await fetchJson<RoundTableAutopilotResponse>(
          '/api/autopilot/plan-from-roundtable',
          {
            method: 'POST',
            body: JSON.stringify(params),
          },
        );

        if (!data.ok) {
          throw new Error('round-table plan returned ok=false');
        }

        setLastResponse(data);
        return data;
      } catch (err: any) {
        console.error('[useRoundTableAutopilotPlan] error:', err);
        setError(err?.message ?? 'Unknown error');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return {
    run,
    loading,
    lastResponse,
    error,
  };
}

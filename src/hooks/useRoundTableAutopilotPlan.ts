
// hooks/useRoundTableAutopilotPlan.ts

import { useCallback, useState } from 'react';
import { AutopilotCommand, RiskVerdict, VisionResult } from '../types';
import { apiClient } from '../utils/apiClient';

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
  riskCommandComment?: string | null;
  riskCommandVerdict?: RiskVerdict;
}

export interface AutopilotCommandRisk {
  verdict: RiskVerdict;
  comment: string | null;
  summary: string | null;
}

export interface RoundTableAutopilotResponse {
  ok: boolean;
  roundTable: RoundTableResult;
  autopilotCommand: AutopilotCommand | null;
  autopilotCommandRisk: AutopilotCommandRisk;
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
      visionResult?: VisionResult | null;
    }) => {
      try {
        setLoading(true);
        setError(null);

        const data = await apiClient.post<RoundTableAutopilotResponse>(
          '/api/autopilot/plan-from-roundtable',
          params
        );

        if (!data.ok) {
          throw new Error('round-table plan returned ok=false');
        }

        setLastResponse(data);
        return data;
      } catch (err: any) {
        // Log handled by apiClient
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

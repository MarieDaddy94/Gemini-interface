
import { useCallback, useState } from 'react';
import {
  AutopilotMode,
  AutopilotCommand,
  AutopilotExecuteResponse,
  BrokerSnapshot,
} from '../types';
import { apiClient } from '../utils/apiClient';
import { logger } from '../services/logger';
import { useBroker } from '../context/BrokerContext';

// Deprecated poller (kept signature for compatibility but uses Context now)
export function useBrokerSnapshot(pollMs: number = 10_000) {
  const { brokerData, loading, error, refreshSnapshot } = useBroker();

  // Map BrokerAccountInfo (full) to BrokerSnapshot (autopilot subset)
  const snapshot: BrokerSnapshot | null = brokerData ? {
      broker: 'TradeLocker',
      accountId: 'Current', // mapped in backend
      currency: brokerData.balance ? 'USD' : 'USD', // Simplified for now
      balance: brokerData.balance,
      equity: brokerData.equity,
      marginUsed: brokerData.marginUsed,
      marginAvailable: brokerData.equity - brokerData.marginUsed,
      marginLevel: null,
      dailyPnl: 0, // Needs calculation or backend update to include
      dailyDrawdown: 0, 
      netUnrealizedPnl: brokerData.equity - brokerData.balance,
      openRisk: 0, // Needs calculation
      openPositions: brokerData.positions.map(p => ({
          id: p.id,
          instrumentId: null,
          symbol: p.symbol,
          side: p.side === 'buy' ? 'LONG' : 'SHORT',
          size: p.size,
          entryPrice: p.entryPrice,
          stopLoss: 0, // Not currently in lightweight BrokerPosition
          takeProfit: 0,
          unrealizedPnl: p.pnl
      })),
      updatedAt: new Date().toISOString()
  } : null;

  return { snapshot, loading, error, reload: refreshSnapshot };
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
  const { refreshSnapshot } = useBroker();

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
          throw new Error('Execute response ok=false'); 
        }

        setLastResponse(data);
        
        // Immediately refresh broker state after execution
        if (data.result.executed) {
            refreshSnapshot().catch(console.error);
        }

        return data;
      } catch (err: any) {
        logger.error('Autopilot execution failed', err);
        setError(err?.message ?? 'Unknown error');
        throw err;
      } finally {
        setExecuting(false);
      }
    },
    [refreshSnapshot],
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


import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import {
  AutopilotJournalEntry,
  AutopilotExecutionStatus,
} from '../types';
import { useTradingSession } from './TradingSessionContext';
import { logAutopilotHistory } from '../services/historyApi';

interface AutopilotJournalContextValue {
  entries: AutopilotJournalEntry[];
  addEntry: (entry: Omit<AutopilotJournalEntry, 'id' | 'createdAt'>) => string;
  updateExecution: (args: {
    id: string;
    executionStatus: AutopilotExecutionStatus;
    executionPrice?: number;
    closePrice?: number;
    pnl?: number;
  }) => void;
  clearEntries: () => void;
}

const AutopilotJournalContext =
  createContext<AutopilotJournalContextValue | undefined>(undefined);

interface AutopilotJournalProviderProps {
  children: ReactNode;
}

export const AutopilotJournalProvider: React.FC<
  AutopilotJournalProviderProps
> = ({ children }) => {
  const [entries, setEntries] = useState<AutopilotJournalEntry[]>([]);
  const { state } = useTradingSession();

  const addEntry = (
    entry: Omit<AutopilotJournalEntry, 'id' | 'createdAt'>
  ): string => {
    const id = `aj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = new Date().toISOString();

    const full: AutopilotJournalEntry = {
      id,
      createdAt,
      ...entry,
    };

    setEntries((prev) => [...prev, full]);

    // Fire-and-forget log to backend history store
    logAutopilotHistory(full, state).catch((err) => {
      console.error('Failed to log Autopilot history:', err);
    });

    return id;
  };

  const updateExecution = (args: {
    id: string;
    executionStatus: AutopilotExecutionStatus;
    executionPrice?: number;
    closePrice?: number;
    pnl?: number;
  }) => {
    setEntries((prev) => {
      const next = prev.map((e) => {
        if (e.id === args.id) {
          const updated = {
            ...e,
            executionStatus: args.executionStatus,
            executionPrice:
              args.executionPrice !== undefined
                ? args.executionPrice
                : e.executionPrice,
            closePrice:
              args.closePrice !== undefined ? args.closePrice : e.closePrice,
            pnl: args.pnl !== undefined ? args.pnl : e.pnl,
          };
          
          // Also update backend if execution status changes to closed/executed to capture PnL
          if (args.executionStatus === 'executed' || args.executionStatus === 'cancelled') {
             logAutopilotHistory(updated, state).catch(console.error);
          }
          
          return updated;
        }
        return e;
      });
      return next;
    });
  };

  const clearEntries = () => setEntries([]);

  const value: AutopilotJournalContextValue = useMemo(
    () => ({
      entries,
      addEntry,
      updateExecution,
      clearEntries,
    }),
    [entries, state]
  );

  return (
    <AutopilotJournalContext.Provider value={value}>
      {children}
    </AutopilotJournalContext.Provider>
  );
};

export const useAutopilotJournal = (): AutopilotJournalContextValue => {
  const ctx = useContext(AutopilotJournalContext);
  if (!ctx) {
    throw new Error(
      'useAutopilotJournal must be used within an AutopilotJournalProvider'
    );
  }
  return ctx;
};

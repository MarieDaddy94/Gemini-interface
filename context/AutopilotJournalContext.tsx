
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
    return id;
  };

  const updateExecution = (args: {
    id: string;
    executionStatus: AutopilotExecutionStatus;
    executionPrice?: number;
    closePrice?: number;
    pnl?: number;
  }) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.id === args.id
          ? {
              ...e,
              executionStatus: args.executionStatus,
              executionPrice:
                args.executionPrice !== undefined
                  ? args.executionPrice
                  : e.executionPrice,
              closePrice:
                args.closePrice !== undefined ? args.closePrice : e.closePrice,
              pnl: args.pnl !== undefined ? args.pnl : e.pnl,
            }
          : e
      )
    );
  };

  const clearEntries = () => setEntries([]);

  const value: AutopilotJournalContextValue = useMemo(
    () => ({
      entries,
      addEntry,
      updateExecution,
      clearEntries,
    }),
    [entries]
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

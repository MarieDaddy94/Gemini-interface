
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiClient } from '../utils/apiClient';

export interface JournalEntry {
  id: string;
  createdAt: string;
  source: string;
  symbol: string;
  direction?: 'long' | 'short';
  status: 'planned' | 'executed' | 'closed' | 'cancelled';
  resultR?: number;
  resultPnl?: number;
  entryPrice?: number;
  notes?: string;
  playbook?: string;
  tags?: string[];
  [key: string]: any;
}

interface JournalContextValue {
  entries: JournalEntry[];
  loading: boolean;
  refreshJournal: () => Promise<void>;
  addEntry: (entry: Partial<JournalEntry>) => Promise<void>;
  updateEntry: (id: string, updates: Partial<JournalEntry>) => Promise<void>;
  exportJournal: () => void;
  importJournal: (file: File) => Promise<void>;
  setEntries: (entries: JournalEntry[]) => void;
}

const JournalContext = createContext<JournalContextValue | undefined>(undefined);

export const JournalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshJournal = async () => {
    setLoading(true);
    try {
      const data = await apiClient.get<JournalEntry[]>('/api/journal/list');
      // Sort desc by creation
      data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setEntries(data);
    } catch (e) {
      console.error('Failed to load journal', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshJournal();
  }, []);

  const addEntry = async (entry: Partial<JournalEntry>) => {
    try {
      const newEntry = await apiClient.post<JournalEntry>('/api/journal/log', entry);
      setEntries(prev => [newEntry, ...prev]);
    } catch (e) {
      console.error('Failed to add entry', e);
    }
  };

  const updateEntry = async (id: string, updates: Partial<JournalEntry>) => {
    try {
      const updated = await apiClient.post<JournalEntry>('/api/journal/update', { id, ...updates });
      setEntries(prev => prev.map(e => e.id === id ? updated : e));
    } catch (e) {
      console.error('Failed to update entry', e);
    }
  };

  const exportJournal = () => {
    const dataStr = JSON.stringify(entries, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `journal_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Import unimplemented for API version in this iteration
  const importJournal = async (file: File) => {
    alert("Import not yet supported with backend sync.");
  };

  const value: JournalContextValue = {
    entries,
    loading,
    refreshJournal,
    addEntry,
    updateEntry,
    exportJournal,
    importJournal,
    setEntries
  };

  return (
    <JournalContext.Provider value={value}>
      {children}
    </JournalContext.Provider>
  );
};

export const useJournal = () => {
  const ctx = useContext(JournalContext);
  if (!ctx) throw new Error('useJournal must be used within JournalProvider');
  return ctx;
};

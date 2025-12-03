
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Playbook, PlaybookTier } from '../types';
import { playbookApi, PlaybookFilter } from '../services/playbookApi';

interface PlaybookContextValue {
  playbooks: Playbook[];
  loading: boolean;
  loadPlaybooks: (filter?: PlaybookFilter) => Promise<void>;
  createPlaybook: (data: Partial<Playbook>) => Promise<void>;
  updatePlaybook: (id: string, patch: Partial<Playbook>) => Promise<void>;
  refreshStats: (id: string) => Promise<void>;
}

const PlaybookContext = createContext<PlaybookContextValue | undefined>(undefined);

export const PlaybookProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [loading, setLoading] = useState(false);

  const loadPlaybooks = async (filter?: PlaybookFilter) => {
    setLoading(true);
    try {
      const list = await playbookApi.fetchPlaybooks(filter);
      setPlaybooks(list);
    } catch (e) {
      console.error("Failed to load playbooks", e);
    } finally {
      setLoading(false);
    }
  };

  const createPlaybook = async (data: Partial<Playbook>) => {
    try {
      const created = await playbookApi.createPlaybook(data);
      setPlaybooks(prev => [created, ...prev]);
    } catch (e) {
      console.error("Failed to create playbook", e);
      throw e;
    }
  };

  const updatePlaybook = async (id: string, patch: Partial<Playbook>) => {
    try {
      const updated = await playbookApi.updatePlaybook(id, patch);
      setPlaybooks(prev => prev.map(p => p.id === id ? updated : p));
    } catch (e) {
      console.error("Failed to update playbook", e);
      throw e;
    }
  };

  const refreshStats = async (id: string) => {
    try {
      const updated = await playbookApi.refreshStats(id);
      setPlaybooks(prev => prev.map(p => p.id === id ? updated : p));
    } catch (e) {
      console.error("Failed to refresh stats", e);
    }
  };

  // Initial load
  useEffect(() => {
    loadPlaybooks();
  }, []);

  return (
    <PlaybookContext.Provider value={{
      playbooks,
      loading,
      loadPlaybooks,
      createPlaybook,
      updatePlaybook,
      refreshStats
    }}>
      {children}
    </PlaybookContext.Provider>
  );
};

export const usePlaybooks = () => {
  const ctx = useContext(PlaybookContext);
  if (!ctx) throw new Error("usePlaybooks must be used within PlaybookProvider");
  return ctx;
};

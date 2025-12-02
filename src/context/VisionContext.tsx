
import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { VisionResult, VisionSnapshot } from '../types';
import { fetchRecentVisionSnapshots } from '../services/visionApi';

interface VisionContextValue {
  visionSummary: string | null;
  setVisionSummary: (summary: string | null) => void;
  latestVisionResult: VisionResult | null;
  setLatestVisionResult: (result: VisionResult | null) => void;
  recentSnapshots: VisionSnapshot[];
  refreshRecentSnapshots: (symbol?: string) => Promise<void>;
}

const VisionContext = createContext<VisionContextValue | undefined>(undefined);

export const VisionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [visionSummary, setVisionSummary] = useState<string | null>(null);
  const [latestVisionResult, setLatestVisionResult] = useState<VisionResult | null>(null);
  const [recentSnapshots, setRecentSnapshots] = useState<VisionSnapshot[]>([]);

  const refreshRecentSnapshots = async (symbol?: string) => {
      try {
          const snaps = await fetchRecentVisionSnapshots(symbol);
          setRecentSnapshots(snaps);
      } catch (e) {
          console.error("Failed to fetch recent snapshots", e);
      }
  };

  // Initial load
  useEffect(() => {
      refreshRecentSnapshots();
  }, []);

  return (
    <VisionContext.Provider value={{ 
        visionSummary, 
        setVisionSummary, 
        latestVisionResult, 
        setLatestVisionResult,
        recentSnapshots,
        refreshRecentSnapshots
    }}>
      {children}
    </VisionContext.Provider>
  );
};

export function useVision(): VisionContextValue {
  const ctx = useContext(VisionContext);
  if (!ctx) {
    throw new Error('useVision must be used within a VisionProvider');
  }
  return ctx;
}

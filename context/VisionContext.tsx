
import React, { createContext, useContext, useState, ReactNode } from 'react';

interface VisionContextValue {
  visionSummary: string | null;
  setVisionSummary: (summary: string | null) => void;
}

const VisionContext = createContext<VisionContextValue | undefined>(undefined);

export const VisionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [visionSummary, setVisionSummary] = useState<string | null>(null);

  return (
    <VisionContext.Provider value={{ visionSummary, setVisionSummary }}>
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

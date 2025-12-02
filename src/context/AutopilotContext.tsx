
import React, { createContext, useContext, useState, ReactNode } from 'react';
import { AutopilotCommand, RiskVerdict } from '../types';

interface AutopilotContextValue {
  activeProposal: AutopilotCommand | null;
  proposalSource: 'manual' | 'agent' | 'desk' | 'voice';
  riskVerdict: RiskVerdict | null;
  riskComment: string | null;
  
  setProposal: (
    cmd: AutopilotCommand | null, 
    source: 'manual' | 'agent' | 'desk' | 'voice',
    risk?: { verdict: RiskVerdict; comment: string | null }
  ) => void;
  
  clearProposal: () => void;
}

const AutopilotContext = createContext<AutopilotContextValue | undefined>(undefined);

export const AutopilotProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeProposal, setActiveProposal] = useState<AutopilotCommand | null>(null);
  const [proposalSource, setProposalSource] = useState<'manual' | 'agent' | 'desk' | 'voice'>('manual');
  const [riskVerdict, setRiskVerdict] = useState<RiskVerdict | null>(null);
  const [riskComment, setRiskComment] = useState<string | null>(null);

  const setProposal = (
    cmd: AutopilotCommand | null,
    source: 'manual' | 'agent' | 'desk' | 'voice',
    risk?: { verdict: RiskVerdict; comment: string | null }
  ) => {
    setActiveProposal(cmd);
    setProposalSource(source);
    if (risk) {
      setRiskVerdict(risk.verdict);
      setRiskComment(risk.comment);
    } else {
      // Reset risk info if new proposal comes without pre-calculated risk
      setRiskVerdict(null);
      setRiskComment(null);
    }
  };

  const clearProposal = () => {
    setActiveProposal(null);
    setProposalSource('manual');
    setRiskVerdict(null);
    setRiskComment(null);
  };

  return (
    <AutopilotContext.Provider value={{ 
      activeProposal, 
      proposalSource, 
      riskVerdict, 
      riskComment, 
      setProposal, 
      clearProposal 
    }}>
      {children}
    </AutopilotContext.Provider>
  );
};

export const useAutopilotContext = (): AutopilotContextValue => {
  const ctx = useContext(AutopilotContext);
  if (!ctx) {
    throw new Error('useAutopilotContext must be used within AutopilotProvider');
  }
  return ctx;
};


import React, { createContext, useContext, useEffect, useState } from 'react';

export type AgentId = "quant_bot" | "trend_master" | "pattern_gpt" | "journal_coach";

export interface AgentConfig {
  provider: 'gemini' | 'openai';
  model: string;
}

export type AgentConfigMap = Record<string, AgentConfig>;

// Default configurations matching server defaults
const DEFAULT_CONFIG: AgentConfigMap = {
  quant_bot: { provider: 'gemini', model: 'gemini-2.5-flash' },
  trend_master: { provider: 'gemini', model: 'gemini-2.5-flash' },
  pattern_gpt: { provider: 'openai', model: 'gpt-4o-mini' },
  journal_coach: { provider: 'gemini', model: 'gemini-2.5-flash' }
};

interface AgentConfigContextValue {
  agentConfigs: AgentConfigMap;
  updateAgentConfig: (agentId: string, config: Partial<AgentConfig>) => void;
  resetToDefaults: () => void;
}

const AgentConfigContext = createContext<AgentConfigContextValue | undefined>(undefined);

export const AgentConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [agentConfigs, setAgentConfigs] = useState<AgentConfigMap>(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('ai_agent_configs_v1');
      if (saved) {
        try {
          return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
        } catch (e) {
          console.error("Failed to parse saved agent configs", e);
        }
      }
    }
    return DEFAULT_CONFIG;
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('ai_agent_configs_v1', JSON.stringify(agentConfigs));
    }
  }, [agentConfigs]);

  const updateAgentConfig = (agentId: string, config: Partial<AgentConfig>) => {
    setAgentConfigs(prev => ({
      ...prev,
      [agentId]: {
        ...(prev[agentId] || DEFAULT_CONFIG[agentId as AgentId] || { provider: 'gemini', model: 'gemini-2.5-flash' }),
        ...config
      }
    }));
  };

  const resetToDefaults = () => {
    setAgentConfigs(DEFAULT_CONFIG);
  };

  return (
    <AgentConfigContext.Provider value={{ agentConfigs, updateAgentConfig, resetToDefaults }}>
      {children}
    </AgentConfigContext.Provider>
  );
};

export const useAgentConfig = () => {
  const ctx = useContext(AgentConfigContext);
  if (!ctx) {
    throw new Error("useAgentConfig must be used within AgentConfigProvider");
  }
  return ctx;
};

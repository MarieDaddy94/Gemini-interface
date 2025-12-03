
import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import {
  TradingSessionState,
  TradingEnvironment,
  AutopilotMode,
  AgentDefinition,
  AgentMessage,
  TradingInstrument,
  TimeframeState,
  AccountState,
  RiskConfig,
  RiskRuntimeState,
  AutopilotConfig,
} from '../types';
import { useBroker } from './BrokerContext'; // Import Broker Context

// -------------------------------
// Default values
// -------------------------------

const defaultInstrument: TradingInstrument = {
  symbol: 'US30',
  displayName: 'US30 (Dow Jones)',
  brokerSymbol: 'US30',
};

const defaultTimeframe: TimeframeState = {
  currentTimeframe: '1m',
  higherTimeframes: ['15m', '1h', '4h', '1D', '1W'],
};

const defaultAccount: AccountState = {
  accountId: undefined,
  accountName: 'Disconnected',
  equity: undefined,
  balance: undefined,
  currency: 'USD',
  isFundedAccount: false,
  fundedSize: undefined,
};

const defaultAgents: AgentDefinition[] = [
  {
    id: 'strategist-main',
    name: 'Strategist',
    role: 'strategist',
    description: 'Reads market structure and builds the narrative.',
    modelHint: 'gpt-5.1',
    isEnabled: true,
  },
  {
    id: 'risk-manager',
    name: 'Risk Manager',
    role: 'risk',
    description: 'Enforces risk limits and prop-style rules.',
    modelHint: 'gpt-5.1',
    isEnabled: true,
  },
  {
    id: 'quant-analyst',
    name: 'Quant Analyst',
    role: 'quant',
    description: 'Looks at stats, backtests, and pattern performance.',
    modelHint: 'gemini-1.5-pro',
    isEnabled: true,
  },
  {
    id: 'execution-bot',
    name: 'Execution Bot',
    role: 'execution',
    description: 'Translates plans into precise orders (via risk layer).',
    modelHint: 'gpt-5.1',
    isEnabled: true,
  },
  {
    id: 'journal-coach',
    name: 'Journal Coach',
    role: 'journal',
    description: 'Helps with journaling and post-trade review.',
    modelHint: 'gemini-1.5-pro',
    isEnabled: true,
  },
];

const defaultRiskConfig: RiskConfig = {
  maxRiskPerTradePercent: 0.5, // 0.5% per trade
  maxDailyLossPercent: 3,      // 3% daily cap
  maxWeeklyLossPercent: 8,     // 8% weekly cap
  maxTradesPerDay: 5,
};

const defaultRiskRuntime: RiskRuntimeState = {
  tradesTakenToday: 0,
  realizedPnlTodayPercent: 0,
  realizedPnlWeekPercent: 0,
};

const defaultAutopilotConfig: AutopilotConfig = {
  allowFullAutoInLive: false,
  requireVoiceConfirmForFullAuto: true,
};

const defaultSessionState: TradingSessionState = {
  environment: 'sim',
  autopilotMode: 'off',
  instrument: defaultInstrument,
  timeframe: defaultTimeframe,
  account: defaultAccount,
  agents: defaultAgents,
  messages: [],
  riskConfig: defaultRiskConfig,
  riskRuntime: defaultRiskRuntime,
  autopilotConfig: defaultAutopilotConfig,
  isBrokerConnected: false,
  isNewsHighImpactNow: false,
  isVisionActive: false,
};

// -------------------------------
// Context shape
// -------------------------------

interface TradingSessionContextValue {
  state: TradingSessionState;
  setEnvironment: (env: TradingEnvironment) => void;
  setAutopilotMode: (mode: AutopilotMode) => void;
  setInstrument: (instrument: TradingInstrument) => void;
  setTimeframe: (timeframe: Partial<TimeframeState>) => void;
  setAccount: (account: Partial<AccountState>) => void;
  setAgents: (agents: AgentDefinition[]) => void;
  addMessage: (msg: Omit<AgentMessage, 'id' | 'createdAt'>) => void;
  clearMessages: () => void;
  setBrokerConnected: (connected: boolean) => void;
  setNewsHighImpactNow: (flag: boolean) => void;
  setVisionActive: (flag: boolean) => void;

  // Risk & autopilot setters
  setRiskConfig: (cfg: Partial<RiskConfig>) => void;
  updateRiskRuntime: (runtime: Partial<RiskRuntimeState>) => void;
  setAutopilotConfig: (cfg: Partial<AutopilotConfig>) => void;
}

const TradingSessionContext = createContext<TradingSessionContextValue | undefined>(
  undefined
);

// -------------------------------
// Provider
// -------------------------------

interface TradingSessionProviderProps {
  children: ReactNode;
}

export const TradingSessionProvider: React.FC<TradingSessionProviderProps> = ({
  children,
}) => {
  const [state, setState] = useState<TradingSessionState>(defaultSessionState);
  
  // Consume Broker Data to Auto-Sync
  const { brokerData, brokerSessionId } = useBroker();

  // EFFECT: Sync Broker -> Session Account State
  useEffect(() => {
    if (brokerSessionId && brokerData) {
        setState(prev => ({
            ...prev,
            isBrokerConnected: true,
            account: {
                ...prev.account,
                accountId: brokerSessionId,
                accountName: 'TradeLocker Account', // or fetch name if available
                balance: brokerData.balance,
                equity: brokerData.equity,
                currency: 'USD' // simplifying for now
            }
        }));
    } else {
        setState(prev => ({
            ...prev,
            isBrokerConnected: false
        }));
    }
  }, [brokerData, brokerSessionId]);

  const setEnvironment = (env: TradingEnvironment) => {
    setState((prev) => ({
      ...prev,
      environment: env,
    }));
  };

  const setAutopilotMode = (mode: AutopilotMode) => {
    setState((prev) => ({
      ...prev,
      autopilotMode: mode,
    }));
  };

  const setInstrument = (instrument: TradingInstrument) => {
    setState((prev) => ({
      ...prev,
      instrument,
    }));
  };

  const setTimeframe = (timeframe: Partial<TimeframeState>) => {
    setState((prev) => ({
      ...prev,
      timeframe: {
        ...prev.timeframe,
        ...timeframe,
      },
    }));
  };

  const setAccount = (account: Partial<AccountState>) => {
    setState((prev) => ({
      ...prev,
      account: {
        ...prev.account,
        ...account,
      },
    }));
  };

  const setAgents = (agents: AgentDefinition[]) => {
    setState((prev) => ({
      ...prev,
      agents,
    }));
  };

  const addMessage = (msg: Omit<AgentMessage, 'id' | 'createdAt'>) => {
    const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = new Date().toISOString();

    const fullMessage: AgentMessage = {
      id,
      createdAt,
      ...msg,
    };

    setState((prev) => ({
      ...prev,
      messages: [...prev.messages, fullMessage],
    }));
  };

  const clearMessages = () => {
    setState((prev) => ({
      ...prev,
      messages: [],
    }));
  };

  const setBrokerConnected = (connected: boolean) => {
    setState((prev) => ({
      ...prev,
      isBrokerConnected: connected,
    }));
  };

  const setNewsHighImpactNow = (flag: boolean) => {
    setState((prev) => ({
      ...prev,
      isNewsHighImpactNow: flag,
    }));
  };

  const setVisionActive = (flag: boolean) => {
    setState((prev) => ({
      ...prev,
      isVisionActive: flag,
    }));
  };

  const setRiskConfig = (cfg: Partial<RiskConfig>) => {
    setState((prev) => ({
      ...prev,
      riskConfig: {
        ...prev.riskConfig,
        ...cfg,
      },
    }));
  };

  const updateRiskRuntime = (runtime: Partial<RiskRuntimeState>) => {
    setState((prev) => ({
      ...prev,
      riskRuntime: {
        ...prev.riskRuntime,
        ...runtime,
      },
    }));
  };

  const setAutopilotConfig = (cfg: Partial<AutopilotConfig>) => {
    setState((prev) => ({
      ...prev,
      autopilotConfig: {
        ...prev.autopilotConfig,
        ...cfg,
      },
    }));
  };

  const value: TradingSessionContextValue = useMemo(
    () => ({
      state,
      setEnvironment,
      setAutopilotMode,
      setInstrument,
      setTimeframe,
      setAccount,
      setAgents,
      addMessage,
      clearMessages,
      setBrokerConnected,
      setNewsHighImpactNow,
      setVisionActive,
      setRiskConfig,
      updateRiskRuntime,
      setAutopilotConfig,
    }),
    [state]
  );

  return (
    <TradingSessionContext.Provider value={value}>
      {children}
    </TradingSessionContext.Provider>
  );
};

// -------------------------------
// Hook
// -------------------------------

export const useTradingSession = (): TradingSessionContextValue => {
  const ctx = useContext(TradingSessionContext);
  if (!ctx) {
    throw new Error(
      'useTradingSession must be used within a TradingSessionProvider'
    );
  }
  return ctx;
};


import React, { createContext, useContext, useState, useMemo, ReactNode } from 'react';

export type DeskRoleId = 'strategist' | 'pattern' | 'quant' | 'risk' | 'execution' | 'journal' | 'news';

export type DeskRoleStatus = 'idle' | 'scanning' | 'alert' | 'busy' | 'cooldown';

export type DeskSessionPhase = 'preSession' | 'live' | 'cooldown' | 'postSession';

export interface DeskRoleState {
  id: DeskRoleId;
  label: string;
  onDesk: boolean; // Is this agent currently "clocked in"?
  symbolFocus: string | null;
  timeframes: string[];
  status: DeskRoleStatus;
  lastUpdate: string | null; // e.g. "Bias bullish above 34200"
}

export interface TradingDeskState {
  deskName: string;
  goal: string | null; // e.g. "Catch 1-2 clean trend moves on US30"
  sessionPhase: DeskSessionPhase;
  roles: Record<DeskRoleId, DeskRoleState>;
}

export interface DeskActions {
  setDeskGoal: (goal: string) => void;
  setSessionPhase: (phase: DeskSessionPhase) => void;
  
  /** Configuration changes (who watches what) */
  assignRole: (
    roleId: DeskRoleId,
    updates: Partial<Pick<DeskRoleState, "symbolFocus" | "timeframes" | "onDesk">>
  ) => void;

  /** Live status updates (what are they doing) */
  updateRoleStatus: (
    roleId: DeskRoleId,
    updates: Partial<Pick<DeskRoleState, "status" | "lastUpdate">>
  ) => void;

  resetDesk: () => void;
}

export interface DeskContextValue {
  state: TradingDeskState;
  actions: DeskActions;
}

// Default initial state
const INITIAL_ROLES: Record<DeskRoleId, DeskRoleState> = {
  strategist: {
    id: 'strategist',
    label: 'Strategist',
    onDesk: true,
    symbolFocus: 'US30',
    timeframes: ['15m', '1h', '4h'],
    status: 'scanning',
    lastUpdate: 'Monitoring HTF structure for NY Open bias.',
  },
  risk: {
    id: 'risk',
    label: 'Risk Manager',
    onDesk: true,
    symbolFocus: 'Account',
    timeframes: [],
    status: 'idle',
    lastUpdate: 'All clear. Daily drawdown 0%.',
  },
  pattern: {
    id: 'pattern',
    label: 'Pattern GPT',
    onDesk: true,
    symbolFocus: 'US30',
    timeframes: ['1m', '5m'],
    status: 'scanning',
    lastUpdate: 'Scanning for liquidity sweeps on 1m.',
  },
  quant: {
    id: 'quant',
    label: 'Quant Analyst',
    onDesk: false,
    symbolFocus: null,
    timeframes: [],
    status: 'idle',
    lastUpdate: null,
  },
  execution: {
    id: 'execution',
    label: 'Execution Bot',
    onDesk: true,
    symbolFocus: 'US30',
    timeframes: ['1m'],
    status: 'idle',
    lastUpdate: 'Waiting for signal confirmation.',
  },
  journal: {
    id: 'journal',
    label: 'Journal Coach',
    onDesk: false,
    symbolFocus: null,
    timeframes: [],
    status: 'idle',
    lastUpdate: null,
  },
  news: {
    id: 'news',
    label: 'News & Macro',
    onDesk: false,
    symbolFocus: 'Calendar',
    timeframes: [],
    status: 'idle',
    lastUpdate: null,
  }
};

const DeskContext = createContext<DeskContextValue | undefined>(undefined);

export const DeskProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [deskState, setDeskState] = useState<TradingDeskState>({
    deskName: 'Main Trading Desk',
    goal: 'Identify high-quality setups with 2R+ potential.',
    sessionPhase: 'preSession',
    roles: INITIAL_ROLES,
  });

  const actions = useMemo<DeskActions>(() => ({
    setDeskGoal: (goal) =>
      setDeskState((prev) => ({ ...prev, goal: goal.trim() ? goal : null })),

    setSessionPhase: (phase) =>
      setDeskState((prev) => ({ ...prev, sessionPhase: phase })),

    assignRole: (roleId, updates) =>
      setDeskState((prev) => ({
        ...prev,
        roles: {
          ...prev.roles,
          [roleId]: { ...prev.roles[roleId], ...updates },
        },
      })),

    updateRoleStatus: (roleId, updates) =>
      setDeskState((prev) => ({
        ...prev,
        roles: {
          ...prev.roles,
          [roleId]: { ...prev.roles[roleId], ...updates },
        },
      })),

    resetDesk: () => setDeskState({
        deskName: 'Main Trading Desk',
        goal: 'Identify high-quality setups with 2R+ potential.',
        sessionPhase: 'preSession',
        roles: INITIAL_ROLES,
    }),
  }), []);

  return (
    <DeskContext.Provider value={{ state: deskState, actions }}>
      {children}
    </DeskContext.Provider>
  );
};

export const useDesk = (): DeskContextValue => {
  const ctx = useContext(DeskContext);
  if (!ctx) {
    throw new Error('useDesk must be used within a DeskProvider');
  }
  return ctx;
};

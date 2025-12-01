
import React, {
  createContext,
  useContext,
  useMemo,
  useState,
} from "react";

export type JournalSource = "user" | "ai" | "broker";
export type TradeDirection = "long" | "short";

export interface JournalEntry {
  id: string;
  timestamp: string;         // ISO datetime

  // Trading metadata
  symbol?: string;           // "US30", "NAS100", "XAUUSD", etc.
  direction?: TradeDirection;
  timeframe?: string;        // "1m", "5m", "15m", "1h", etc.
  session?: string;          // "Asia", "London", "NY", etc.

  entryPrice?: number;
  stopPrice?: number;
  targetPrice?: number;
  exitPrice?: number;

  size?: number;             // lots/contracts
  netPnl?: number;           // in currency
  currency?: string;         // "USD"
  rMultiple?: number;        // PnL in R

  playbook?: string;         // name of setup / play
  preTradePlan?: string;     // what was planned
  postTradeNotes?: string;   // what actually happened
  sentiment?: string;        // "A+", "A", "B", etc.

  tags?: string[];
  relatedTradeId?: string;   // broker trade id, if any

  // Agent metadata
  agentId?: string;          // e.g. "quant", "pattern", "risk", "macro", "coach"
  agentName?: string;        // e.g. "Quant Strategist"

  // Provenance
  source: JournalSource;     // "ai", "user", "broker"
  raw?: any;                 // raw tool payload / event if needed
  
  // Legacy compatibility fields
  focusSymbol?: string; 
  bias?: string; 
  note?: string; 
  outcome?: string;
  finalPnl?: number | null;
  linkedPositionId?: string | null;
  linkedSymbol?: string | null;
  accountSnapshot?: any;
  entryType?: string;
  sessionId?: string;
  confidence?: number;

  // Analytics fields
  rr?: number | null;   // Risk:Reward for the trade (e.g. 1.5, 2.0, -1.0)
  pnl?: number | null;  // Realized PnL (e.g. +120.5, -80.0) in your chosen units
}

export interface ToolResult {
  toolName: string;
  args: any;
  result: any;
}

interface JournalContextValue {
  entries: JournalEntry[];
  addEntry: (entry: JournalEntry) => void;
  addEntryFromToolResult: (toolResult: ToolResult) => void;
  setEntries: (entries: JournalEntry[]) => void;
  clearJournal: () => void;
}

const JournalContext = createContext<JournalContextValue | undefined>(
  undefined
);

export const JournalProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [entries, setEntries] = useState<JournalEntry[]>([]);

  const addEntry = (entry: JournalEntry) => {
    setEntries((prev) => [entry, ...prev]);
  };

  const addEntryFromToolResult = (toolResult: ToolResult) => {
    if (toolResult.toolName !== "append_journal_entry") return;

    const args = toolResult.args || {};
    const nowIso = new Date().toISOString();

    const entry: JournalEntry = {
      id:
        typeof args.id === "string"
          ? args.id
          : `ai-${nowIso}-${Math.random().toString(16).slice(2)}`,
      timestamp:
        typeof args.timestamp === "string" ? args.timestamp : nowIso,

      symbol: typeof args.symbol === "string" ? args.symbol : undefined,
      direction:
        args.direction === "long" || args.direction === "short"
          ? args.direction
          : undefined,
      timeframe:
        typeof args.timeframe === "string" ? args.timeframe : undefined,
      session:
        typeof args.session === "string" ? args.session : undefined,

      entryPrice:
        typeof args.entryPrice === "number"
          ? args.entryPrice
          : undefined,
      stopPrice:
        typeof args.stopPrice === "number" ? args.stopPrice : undefined,
      targetPrice:
        typeof args.targetPrice === "number"
          ? args.targetPrice
          : undefined,
      exitPrice:
        typeof args.exitPrice === "number" ? args.exitPrice : undefined,

      size: typeof args.size === "number" ? args.size : undefined,
      netPnl:
        typeof args.netPnl === "number" ? args.netPnl : undefined,
      currency:
        typeof args.currency === "string" ? args.currency : undefined,
      rMultiple:
        typeof args.rMultiple === "number"
          ? args.rMultiple
          : undefined,

      playbook:
        typeof args.playbook === "string" ? args.playbook : undefined,
      preTradePlan:
        typeof args.preTradePlan === "string"
          ? args.preTradePlan
          : undefined,
      postTradeNotes:
        typeof args.postTradeNotes === "string"
          ? args.postTradeNotes
          : undefined,
      sentiment:
        typeof args.sentiment === "string" ? args.sentiment : undefined,

      tags: Array.isArray(args.tags)
        ? args.tags.filter((t: any) => typeof t === "string")
        : undefined,

      relatedTradeId:
        typeof args.relatedTradeId === "string"
          ? args.relatedTradeId
          : undefined,

      // NEW: agent metadata
      agentId:
        typeof args.agentId === "string" ? args.agentId : undefined,
      agentName:
        typeof args.agentName === "string" ? args.agentName : undefined,

      source: "ai",
      raw: toolResult,
      
      // Legacy compatibility
      focusSymbol: args.symbol,
      note: args.postTradeNotes || args.preTradePlan || args.note,
      bias: args.direction === 'long' ? 'Bullish' : args.direction === 'short' ? 'Bearish' : 'Neutral',
      outcome: 'Open',

      // Analytics
      rr: typeof args.rr === 'number' ? args.rr : (typeof args.rMultiple === 'number' ? args.rMultiple : null),
      pnl: typeof args.pnl === 'number' ? args.pnl : (typeof args.netPnl === 'number' ? args.netPnl : null),
    };

    setEntries((prev) => [entry, ...prev]);
  };

  const clearJournal = () => {
    setEntries([]);
    // Best effort cleanup of local storage
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('ai-trading-analyst-journal-')) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
      }
    } catch (e) {
      console.error("Failed to clear local storage", e);
    }
  };

  const value = useMemo(
    () => ({
      entries,
      addEntry,
      addEntryFromToolResult,
      setEntries,
      clearJournal
    }),
    [entries]
  );

  return (
    <JournalContext.Provider value={value}>
      {children}
    </JournalContext.Provider>
  );
};

export const useJournal = (): JournalContextValue => {
  const ctx = useContext(JournalContext);
  if (!ctx) {
    throw new Error("useJournal must be used within a JournalProvider");
  }
  return ctx;
};


import React, {
  createContext,
  useContext,
  useMemo,
  useState,
} from "react";
import { JournalEntry } from "../types";

export interface ToolResult {
  toolName: string;
  args: any;
  result: any;
}

interface JournalContextValue {
  entries: JournalEntry[];
  setEntries: (entries: JournalEntry[]) => void;
  addEntry: (entry: JournalEntry) => void;
  addEntryFromToolResult: (toolResult: ToolResult) => void;
}

const JournalContext = createContext<JournalContextValue | undefined>(
  undefined
);

export const JournalProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [entries, setEntriesState] = useState<JournalEntry[]>([]);

  const setEntries = (newEntries: JournalEntry[]) => {
    setEntriesState(newEntries);
  };

  const addEntry = (entry: JournalEntry) => {
    setEntriesState((prev) => [entry, ...prev]);
  };

  const addEntryFromToolResult = (toolResult: ToolResult) => {
    if (toolResult.toolName !== "append_journal_entry") return;

    const args = toolResult.args || {};
    const nowIso = new Date().toISOString();

    const entry: JournalEntry = {
      id:
        args.id ??
        `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: args.timestamp ?? nowIso,

      symbol: args.symbol,
      direction: args.direction,
      timeframe: args.timeframe,
      session: args.session,

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

      source: "ai",
      raw: toolResult,
      
      // Legacy compatibility mapping
      focusSymbol: args.symbol,
      note: args.postTradeNotes || args.preTradePlan || args.note,
      bias: args.direction === 'long' ? 'Bullish' : args.direction === 'short' ? 'Bearish' : 'Neutral',
      outcome: 'Open'
    };

    setEntriesState((prev) => [entry, ...prev]);
  };

  const value = useMemo(
    () => ({
      entries,
      setEntries,
      addEntry,
      addEntryFromToolResult,
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

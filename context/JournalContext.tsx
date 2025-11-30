import React, {
  createContext,
  useContext,
  useMemo,
  useState,
} from "react";
import { JournalEntry } from "../types";

export type JournalSource = "user" | "ai";

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
    const now = new Date().toISOString();
    
    // Map tool args to our JournalEntry type
    // Expected args from tool: note, sentiment, tag
    
    // Construct a pseudo-JournalEntry. 
    // Note: The backend tool handler also saves this to the persistent store,
    // so this is primarily for optimistic UI updates.
    const entry: JournalEntry = {
      id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sessionId: 'current', // Placeholder
      timestamp: now,
      focusSymbol: args.symbol || 'AI-Note',
      bias: args.sentiment === 'bullish' ? 'Bullish' : args.sentiment === 'bearish' ? 'Bearish' : 'Neutral',
      confidence: 3,
      note: args.note || args.content || "AI Generated Entry",
      entryType: 'SessionReview',
      outcome: 'Open',
      tags: args.tag ? [args.tag] : (args.tags || ['AI']),
      accountSnapshot: undefined,
      linkedPositionId: null,
      linkedSymbol: null,
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
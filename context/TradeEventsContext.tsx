
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export type TradeSide = "long" | "short";

export interface TradeEvent {
  id: string;               // unique per trade from broker
  symbol: string;
  side: TradeSide;

  openedAt: string;         // ISO datetime when trade opened
  closedAt?: string;        // ISO datetime when fully closed

  entryPrice: number;
  exitPrice?: number;
  size: number;             // lots/contracts
  pnl?: number;             // in currency
  currency?: string;        // "USD"

  timeframe?: string;
  session?: string;
  playbook?: string;

  preTradePlan?: string;
  postTradeNotes?: string;
  tags?: string[];

  agentId?: string;         // which AI suggested it, if any
  agentName?: string;

  source?: "broker" | "paper" | "backtest";
}

interface TradeEventsContextValue {
  events: TradeEvent[];
  addEvent: (event: TradeEvent) => void;
  updateEvent: (id: string, updates: Partial<TradeEvent>) => void;
}

const TradeEventsContext =
  createContext<TradeEventsContextValue | undefined>(undefined);

export const TradeEventsProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [events, setEvents] = useState<TradeEvent[]>([]);

  const addEvent = useCallback((event: TradeEvent) => {
    setEvents((prev) => {
      // replace if same id already exists
      const idx = prev.findIndex((e) => e.id === event.id);
      if (idx === -1) return [event, ...prev];

      const clone = [...prev];
      clone[idx] = event;
      return clone;
    });
  }, []);

  const updateEvent = useCallback(
    (id: string, updates: Partial<TradeEvent>) => {
      setEvents((prev) =>
        prev.map((e) =>
          e.id === id
            ? {
                ...e,
                ...updates,
              }
            : e
        )
      );
    },
    []
  );

  const value = useMemo(
    () => ({
      events,
      addEvent,
      updateEvent,
    }),
    [events, addEvent, updateEvent]
  );

  return (
    <TradeEventsContext.Provider value={value}>
      {children}
    </TradeEventsContext.Provider>
  );
};

export const useTradeEvents = (): TradeEventsContextValue => {
  const ctx = useContext(TradeEventsContext);
  if (!ctx) {
    throw new Error(
      "useTradeEvents must be used within a TradeEventsProvider"
    );
  }
  return ctx;
};

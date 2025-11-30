
import React, { useEffect, useRef } from "react";
import { useTradeEvents } from "../context/TradeEventsContext";
import { useJournal } from "../context/JournalContext";

const TradeEventsToJournal: React.FC = () => {
  const { events } = useTradeEvents();
  const { addEntry } = useJournal();
  const loggedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    events.forEach((event) => {
      // Only log trades that are closed
      if (!event.closedAt) return;

      // Ensure we only log once per trade id
      if (loggedIds.current.has(event.id)) return;
      loggedIds.current.add(event.id);

      const pnl = event.pnl;

      addEntry({
        id: `trade-${event.id}`,
        timestamp: event.closedAt,
        symbol: event.symbol,
        direction: event.side === "long" ? "long" : "short",
        timeframe: event.timeframe,
        session: event.session,

        entryPrice: event.entryPrice,
        exitPrice: event.exitPrice,
        size: event.size,
        netPnl: pnl,
        currency: event.currency ?? "USD",
        rMultiple: undefined, // you can compute this later from risk

        playbook: event.playbook,
        preTradePlan: event.preTradePlan,
        postTradeNotes: event.postTradeNotes,
        sentiment: undefined,

        tags: event.tags,
        relatedTradeId: event.id,

        agentId: event.agentId,
        agentName: event.agentName,

        source: "broker",
        raw: event,
      });
    });
  }, [events, addEntry]);

  return null;
};

export default TradeEventsToJournal;

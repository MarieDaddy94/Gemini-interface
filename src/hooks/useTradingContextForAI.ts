
import { useMemo } from "react";
import { useTradingSession } from "../context/TradingSessionContext";
import { useJournal } from "../context/JournalContext";
import { useBroker } from "../context/BrokerContext";

export function useTradingContextForAI() {
  const { state: sessionState } = useTradingSession();
  const { entries } = useJournal();
  const { brokerData } = useBroker();

  const value = useMemo(() => {
    const last5 = (entries ?? []).slice(0, 5); 

    const journalInsights = {
      recentTakeaways: last5
        .map((e) => e.postTradeNotes || e.preTradePlan || "")
        .filter((note) => note.length > 5 && note.length < 200),
      recentMistakes: last5
        .flatMap((e) => e.tags ?? [])
        .filter((t) => t.toLowerCase().includes("mistake") || t.toLowerCase().includes("bad")),
      recentWins: last5
        .filter(e => e.outcome === 'Win')
        .flatMap((e) => e.tags ?? []),
    };

    // Construct a safe broker snapshot from Live Broker Data
    // Fallback to session config if broker disconnected
    const brokerSnapshot = {
        balance: brokerData?.balance ?? sessionState.account?.balance ?? 0,
        equity: brokerData?.equity ?? sessionState.account?.equity ?? 0,
        openPnL: brokerData 
            ? (brokerData.equity - brokerData.balance) 
            : (sessionState.account?.equity ?? 0) - (sessionState.account?.balance ?? 0),
        maxDailyDrawdownPct: sessionState.riskConfig.maxDailyLossPercent,
        openPositionsCount: brokerData?.positions.length ?? 0
    };

    return {
      brokerSnapshot,
      journalInsights,
    };
  }, [sessionState, entries, brokerData]);

  return value;
}

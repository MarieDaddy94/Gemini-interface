
import { useMemo } from "react";
import { useTradingSession } from "../context/TradingSessionContext";
import { useJournal } from "../context/JournalContext";
import { useBroker } from "../context/BrokerContext";

export function useTradingContextForAI() {
  const { state: sessionState } = useTradingSession();
  const { entries } = useJournal();
  const { aiSnapshot } = useBroker();

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

    // Use optimized AI snapshot from Broker Context, or fallback to session defaults
    const brokerSnapshot = aiSnapshot ? {
        balance: aiSnapshot.balance,
        equity: aiSnapshot.equity,
        openPnL: aiSnapshot.openPnl,
        maxDailyDrawdownPct: sessionState.riskConfig.maxDailyLossPercent, // Config driven
        openPositionsCount: aiSnapshot.positionCount
    } : {
        balance: sessionState.account?.balance ?? 0,
        equity: sessionState.account?.equity ?? 0,
        openPnL: (sessionState.account?.equity ?? 0) - (sessionState.account?.balance ?? 0),
        maxDailyDrawdownPct: sessionState.riskConfig.maxDailyLossPercent,
        openPositionsCount: 0
    };

    return {
      brokerSnapshot,
      journalInsights,
    };
  }, [sessionState, entries, aiSnapshot]);

  return value;
}

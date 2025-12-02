
import { useMemo } from "react";
import { useTradingSession } from "../context/TradingSessionContext";
import { useJournal } from "../context/JournalContext";

export function useTradingContextForAI() {
  const { state: sessionState } = useTradingSession();
  const { entries } = useJournal();

  const value = useMemo(() => {
    const last5 = (entries ?? []).slice(0, 5); // entries are sorted new to old in context

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

    // Construct a safe broker snapshot from session state
    const brokerSnapshot = {
        balance: sessionState.account?.balance ?? 0,
        equity: sessionState.account?.equity ?? 0,
        openPnL: (sessionState.account?.equity ?? 0) - (sessionState.account?.balance ?? 0),
        maxDailyDrawdownPct: sessionState.riskConfig.maxDailyLossPercent,
        // Since sessionState doesn't hold detailed openPositions, we might need to rely on the backend fetching this via tool,
        // or update context to hold it. Assuming basic metrics here.
        openPositionsCount: 0 
    };

    return {
      brokerSnapshot,
      journalInsights,
    };
  }, [sessionState, entries]);

  return value;
}

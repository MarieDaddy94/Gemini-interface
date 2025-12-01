import React, { useMemo, useState } from "react";
import { useJournal } from "../context/JournalContext";

type ViewMode = "journal" | "playbooks";

const JournalPanel: React.FC = () => {
  const { entries } = useJournal();
  const [showJournalCoachOnly, setShowJournalCoachOnly] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("journal");

  // Apply Journal Coach filter first (this is the "base" dataset)
  const baseEntries = useMemo(
    () =>
      showJournalCoachOnly
        ? entries.filter((e) => e.agentId === "journal_coach")
        : entries,
    [entries, showJournalCoachOnly]
  );

  // Global stats (only closed trades: Win/Loss/BE)
  const stats = useMemo(() => {
    const closed = baseEntries.filter(
      (e) =>
        e.outcome === "Win" ||
        e.outcome === "Loss" ||
        e.outcome === "BE"
    );

    const total = closed.length;
    const wins = closed.filter((e) => e.outcome === "Win").length;
    const losses = closed.filter((e) => e.outcome === "Loss").length;
    const be = closed.filter((e) => e.outcome === "BE").length;
    const winRate = total > 0 ? (wins / total) * 100 : 0;

    return {
      total,
      wins,
      losses,
      be,
      winRate,
    };
  }, [baseEntries]);

  // Playbooks view = grouped by playbook + symbol + direction
  const playbookRows = useMemo(() => {
    type Row = {
      playbook: string;
      symbol: string;
      direction?: "long" | "short";
      total: number;
      wins: number;
      losses: number;
      be: number;
    };

    const map = new Map<string, Row>();

    baseEntries.forEach((e) => {
      // Only count trades with a final outcome
      if (!e.outcome || e.outcome === "Open") return;

      const playbook =
        (e.playbook && e.playbook.trim()) || "Unnamed Setup";
      const symbol = e.symbol || "-";
      const direction = e.direction;

      const key = `${playbook}::${symbol}::${direction ?? ""}`;
      const existing =
        map.get(key) ||
        ({
          playbook,
          symbol,
          direction,
          total: 0,
          wins: 0,
          losses: 0,
          be: 0,
        } as Row);

      existing.total += 1;
      if (e.outcome === "Win") existing.wins += 1;
      else if (e.outcome === "Loss") existing.losses += 1;
      else if (e.outcome === "BE") existing.be += 1;

      map.set(key, existing);
    });

    const rows = Array.from(map.values());

    // Sort by total trades descending
    rows.sort((a, b) => b.total - a.total);

    return rows;
  }, [baseEntries]);

  // Convenience flags
  const isJournalView = viewMode === "journal";
  const isPlaybookView = viewMode === "playbooks";

  return (
    <div className="flex flex-col h-full bg-slate-950 border-t border-slate-800">
      {/* HEADER BAR */}
      <div className="flex items-center justify-between px-4 py-2 text-xs border-b border-slate-800">
        {/* Title + tabs */}
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className="font-semibold tracking-wide text-slate-200 uppercase">
              Trading Journal
            </span>
            <span className="text-[11px] text-slate-500">
              AI-assisted journaling and playbook tracking
            </span>
          </div>

          {/* View Mode Tabs */}
          <div className="flex items-center text-[11px] rounded-full bg-slate-900 border border-slate-700 overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode("journal")}
              className={[
                "px-3 py-1.5 font-medium transition",
                isJournalView
                  ? "bg-sky-500/15 text-sky-300"
                  : "text-slate-400 hover:bg-slate-800",
              ].join(" ")}
            >
              Journal
            </button>
            <button
              type="button"
              onClick={() => setViewMode("playbooks")}
              className={[
                "px-3 py-1.5 font-medium transition",
                isPlaybookView
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "text-slate-400 hover:bg-slate-800",
              ].join(" ")}
            >
              Playbooks
            </button>
          </div>
        </div>

        {/* Right side: filter + stats */}
        <div className="flex items-center gap-4">
          {/* Stats widget */}
          <div className="flex items-center gap-3 text-[11px]">
            <div className="flex flex-col text-slate-400">
              <span className="uppercase tracking-wide text-[10px]">
                Closed Trades
              </span>
              <span className="text-slate-100 font-semibold">
                {stats.total}
              </span>
            </div>
            <div className="flex flex-col text-emerald-300">
              <span className="uppercase tracking-wide text-[10px]">
                Wins
              </span>
              <span className="font-semibold">{stats.wins}</span>
            </div>
            <div className="flex flex-col text-rose-300">
              <span className="uppercase tracking-wide text-[10px]">
                Losses
              </span>
              <span className="font-semibold">{stats.losses}</span>
            </div>
            <div className="flex flex-col text-slate-300">
              <span className="uppercase tracking-wide text-[10px]">
                BE
              </span>
              <span className="font-semibold">{stats.be}</span>
            </div>
            <div className="flex flex-col text-amber-300">
              <span className="uppercase tracking-wide text-[10px]">
                Win Rate
              </span>
              <span className="font-semibold">
                {stats.winRate.toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Journal Coach Filter */}
          <div className="flex items-center gap-2 text-slate-400">
            <span className="text-[10px] uppercase tracking-wide">
              Filter
            </span>
            <button
              type="button"
              onClick={() => setShowJournalCoachOnly((v) => !v)}
              className={[
                "px-2 py-1 rounded-full border text-[11px] font-medium transition",
                showJournalCoachOnly
                  ? "border-amber-400/70 bg-amber-400/10 text-amber-300"
                  : "border-slate-700 bg-slate-900 text-slate-400 hover:bg-slate-800",
              ].join(" ")}
            >
              {showJournalCoachOnly ? "Journal Coach • ON" : "Journal Coach Only"}
            </button>
          </div>
        </div>
      </div>

      {/* TABLE HEADER */}
      {isJournalView && (
        <div className="grid grid-cols-[70px,80px,1.5fr,0.7fr,0.5fr,0.5fr,2.2fr] px-4 py-1 text-[11px] text-slate-400 border-b border-slate-900 bg-slate-950/70">
          <div>Time</div>
          <div>Src</div>
          <div>Playbook</div>
          <div>Symbol</div>
          <div>Dir</div>
          <div>Rsl</div>
          <div>Notes</div>
        </div>
      )}

      {isPlaybookView && (
        <div className="grid grid-cols-[2fr,0.7fr,0.7fr,0.6fr,0.6fr,0.6fr,0.8fr] px-4 py-1 text-[11px] text-slate-400 border-b border-slate-900 bg-slate-950/70">
          <div>Playbook</div>
          <div>Symbol</div>
          <div>Direction</div>
          <div>Total</div>
          <div>Wins</div>
          <div>Losses</div>
          <div>Win Rate</div>
        </div>
      )}

      {/* BODY */}
      <div className="flex-1 overflow-y-auto text-xs">
        {/* JOURNAL VIEW ROWS */}
        {isJournalView && (
          <>
            {baseEntries.length === 0 ? (
              <div className="px-4 py-3 text-[11px] text-slate-500">
                {showJournalCoachOnly
                  ? "No Journal Coach entries yet. Ask something in Post-Trade or Live mode."
                  : "No journal entries yet. Your AI team will log setups here."}
              </div>
            ) : (
              baseEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="grid grid-cols-[70px,80px,1.5fr,0.7fr,0.5fr,0.5fr,2.2fr] px-4 py-1.5 border-b border-slate-900 hover:bg-slate-900/40"
                >
                  {/* Time */}
                  <div className="text-[11px] text-slate-500">
                    {new Date(entry.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>

                  {/* Source (AI/manual) */}
                  <div className="text-[11px]">
                    {entry.source === "ai" ? (
                      <span className="px-1.5 py-0.5 rounded-full bg-sky-500/10 text-sky-300 border border-sky-500/40">
                        AI
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-200 border border-slate-600">
                        Manual
                      </span>
                    )}
                  </div>

                  {/* Playbook */}
                  <div className="truncate text-slate-100">
                    {entry.playbook}
                  </div>

                  {/* Symbol */}
                  <div className="text-slate-200">{entry.symbol}</div>

                  {/* Direction */}
                  <div className="text-slate-200">
                    {entry.direction ? (
                      <span
                        className={
                          entry.direction === "long"
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }
                      >
                        {entry.direction === "long" ? "Long" : "Short"}
                      </span>
                    ) : (
                      "-"
                    )}
                  </div>

                  {/* Outcome */}
                  <div className="text-slate-200">
                    {entry.outcome || "Open"}
                  </div>

                  {/* Notes (summary) */}
                  <div className="truncate text-slate-300">
                    {entry.note}
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {/* PLAYBOOKS VIEW ROWS */}
        {isPlaybookView && (
          <>
            {playbookRows.length === 0 ? (
              <div className="px-4 py-3 text-[11px] text-slate-500">
                {showJournalCoachOnly
                  ? "No Journal Coach playbooks yet. Once Journal Coach logs some trades, they'll show up here grouped by setup."
                  : "No playbooks yet. Once there are closed trades with outcomes, they will be grouped here by setup."}
              </div>
            ) : (
              playbookRows.map((row, idx) => {
                const winRate =
                  row.total > 0 ? (row.wins / row.total) * 100 : 0;

                return (
                  <div
                    key={`${row.playbook}-${row.symbol}-${row.direction}-${idx}`}
                    className="grid grid-cols-[2fr,0.7fr,0.7fr,0.6fr,0.6fr,0.6fr,0.8fr] px-4 py-1.5 border-b border-slate-900 hover:bg-slate-900/40"
                  >
                    <div className="truncate text-slate-100">
                      {row.playbook}
                    </div>
                    <div className="text-slate-200">{row.symbol}</div>
                    <div className="text-slate-200">
                      {row.direction
                        ? row.direction === "long"
                          ? "Long"
                          : "Short"
                        : "-"}
                    </div>
                    <div className="text-slate-200">{row.total}</div>
                    <div className="text-emerald-300">{row.wins}</div>
                    <div className="text-rose-300">{row.losses}</div>
                    <div className="text-amber-300">
                      {winRate.toFixed(1)}%
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default JournalPanel;
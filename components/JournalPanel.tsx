import React, { useMemo, useState } from "react";
import { useJournal } from "../context/JournalContext";

type ViewMode = "journal" | "playbooks";

type PlayDirection = "long" | "short";

type PlaybookRow = {
  playbook: string;
  symbol: string;
  direction?: PlayDirection;
  total: number;
  wins: number;
  losses: number;
  be: number;
};

export type PlaybookReviewPayload = {
  filter: "journal_coach_only" | "all_entries";
  topPlaybooks: {
    playbook: string;
    symbol: string;
    direction?: PlayDirection;
    total: number;
    wins: number;
    losses: number;
    be: number;
    winRate: number;
  }[];
};

interface JournalPanelProps {
  /**
   * Optional callback so the parent (or Chat overlay) can
   * trigger an AI call when the user asks for a playbook review.
   */
  onRequestPlaybookReview?: (payload: PlaybookReviewPayload) => void;
}

const buildPlaybookReviewPrompt = (payload: PlaybookReviewPayload): string => {
  const { filter, topPlaybooks } = payload;

  const lines: string[] = [];
  lines.push(
    "You are my trading journal coach. Using the stats below, analyze my top playbooks and tell me:"
  );
  lines.push(
    "1) Which setups are my true edge, 2) Which ones are leaks I should avoid or refine, and 3) Concrete rules to turn the best ones into repeatable playbooks."
  );
  lines.push("");
  lines.push(
    `Filter applied: ${
      filter === "journal_coach_only" ? "Journal Coach entries only" : "All entries"
    }`
  );
  lines.push("");
  lines.push("Top playbooks by trade count:");
  lines.push("");

  topPlaybooks.forEach((p, i) => {
    lines.push(
      `${i + 1}. Playbook: ${p.playbook} | Symbol: ${p.symbol} | Direction: ${
        p.direction ? (p.direction === "long" ? "Long" : "Short") : "Mixed/NA"
      }`
    );
    lines.push(
      `   Stats -> Total: ${p.total}, Wins: ${p.wins}, Losses: ${p.losses}, BE: ${p.be}, Win Rate: ${p.winRate.toFixed(
        1
      )}%`
    );
    lines.push("");
  });

  lines.push(
    "Based on this, please: (a) rank these from strongest to weakest edge, (b) suggest what conditions I should require before taking each play, and (c) recommend what I should stop doing or de-emphasize."
  );

  return lines.join("\n");
};

const JournalPanel: React.FC<JournalPanelProps> = ({ onRequestPlaybookReview }) => {
  const { entries } = useJournal();
  const [showJournalCoachOnly, setShowJournalCoachOnly] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("journal");

  // Apply Journal Coach filter first (base dataset)
  const baseEntries = useMemo(
    () =>
      showJournalCoachOnly
        ? entries.filter((e) => e.agentId === "journal_coach")
        : entries,
    [entries, showJournalCoachOnly]
  );

  // Global stats (only closed trades)
  const stats = useMemo(() => {
    const closed = baseEntries.filter(
      (e) => e.outcome === "Win" || e.outcome === "Loss" || e.outcome === "BE"
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
  const playbookRows: PlaybookRow[] = useMemo(() => {
    const map = new Map<string, PlaybookRow>();

    baseEntries.forEach((e) => {
      // Only count trades with a final outcome
      if (!e.outcome || e.outcome === "Open") return;

      const playbook = (e.playbook && e.playbook.trim()) || "Unnamed Setup";
      const symbol = e.symbol || "-";
      const direction = e.direction as PlayDirection | undefined;

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
        } as PlaybookRow);

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

  const isJournalView = viewMode === "journal";
  const isPlaybookView = viewMode === "playbooks";

  const handleExportCsv = () => {
    if (playbookRows.length === 0) return;

    const header = [
      "Playbook",
      "Symbol",
      "Direction",
      "Total",
      "Wins",
      "Losses",
      "BE",
      "WinRatePercent",
    ];

    const lines: string[] = [];
    lines.push(header.join(","));

    playbookRows.forEach((row) => {
      const winRate = row.total > 0 ? (row.wins / row.total) * 100 : 0;
      const directionLabel = row.direction
        ? row.direction === "long"
          ? "Long"
          : "Short"
        : "";

      const safePlaybook = `"${row.playbook.replace(/"/g, '""')}"`;

      lines.push(
        [
          safePlaybook,
          row.symbol,
          directionLabel,
          row.total.toString(),
          row.wins.toString(),
          row.losses.toString(),
          row.be.toString(),
          winRate.toFixed(1),
        ].join(",")
      );
    });

    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `journal_playbooks_${dateStr}.csv`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRequestReview = () => {
    if (playbookRows.length === 0) return;

    const top = playbookRows.slice(0, 3).map((row) => {
      const winRate = row.total > 0 ? (row.wins / row.total) * 100 : 0;
      return {
        playbook: row.playbook,
        symbol: row.symbol,
        direction: row.direction,
        total: row.total,
        wins: row.wins,
        losses: row.losses,
        be: row.be,
        winRate,
      };
    });

    const payload: PlaybookReviewPayload = {
      filter: showJournalCoachOnly ? "journal_coach_only" : "all_entries",
      topPlaybooks: top,
    };

    if (onRequestPlaybookReview) {
      onRequestPlaybookReview(payload);
    } else {
      // Fallback: log + copy a ready-to-paste prompt
      console.log("[JournalPanel] AI review requested:", payload);
      const prompt = buildPlaybookReviewPrompt(payload);

      if (navigator.clipboard) {
        navigator.clipboard.writeText(prompt).catch(() => {
          // ignore clipboard errors
        });
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 border-t border-slate-800">
      {/* HEADER BAR */}
      <div className="flex items-center justify-between px-4 py-2 text-xs border-b border-slate-800">
        {/* Left: title + view tabs */}
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

        {/* Right: stats + buttons + filter */}
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

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={playbookRows.length === 0}
              className={[
                "px-2 py-1 rounded-md border text-[11px] font-medium transition",
                playbookRows.length === 0
                  ? "border-slate-700 bg-slate-900 text-slate-600 cursor-not-allowed"
                  : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800",
              ].join(" ")}
            >
              Export Playbooks CSV
            </button>

            <button
              type="button"
              onClick={handleRequestReview}
              disabled={playbookRows.length === 0}
              className={[
                "px-2 py-1 rounded-md border text-[11px] font-medium transition",
                playbookRows.length === 0
                  ? "border-slate-700 bg-slate-900 text-slate-600 cursor-not-allowed"
                  : "border-amber-400/70 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20",
              ].join(" ")}
            >
              Ask AI: Review Top 3
            </button>
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


import React, { useMemo } from 'react';
import { useJournal } from '../context/JournalContext';

const AnalyticsPanel: React.FC = () => {
  const { entries } = useJournal();

  const stats = useMemo(() => {
    const total = entries.length;

    const byOutcome: Record<string, number> = {};
    const bySymbol: Record<string, number> = {};
    const byAgent: Record<string, number> = {};
    const bySource: Record<string, number> = {};

    // NEW: numeric metrics
    let totalPnl = 0;
    let pnlCount = 0;

    let totalRR = 0;
    let rrCount = 0;

    const bySymbolWinLoss: Record<
      string,
      { wins: number; losses: number; be: number; closed: number; pnl: number }
    > = {};

    for (const e of entries) {
      // Outcomes
      if (e.outcome) {
        const key = e.outcome;
        byOutcome[key] = (byOutcome[key] || 0) + 1;
      }

      // Symbols
      const sym = e.symbol ?? 'Unknown';
      if (e.symbol) {
        bySymbol[sym] = (bySymbol[sym] || 0) + 1;
      }

      if (!bySymbolWinLoss[sym]) {
        bySymbolWinLoss[sym] = {
          wins: 0,
          losses: 0,
          be: 0,
          closed: 0,
          pnl: 0,
        };
      }

      // Win / loss / BE tracking
      if (e.outcome === 'Win') {
        bySymbolWinLoss[sym].wins += 1;
        bySymbolWinLoss[sym].closed += 1;
      } else if (e.outcome === 'Loss') {
        bySymbolWinLoss[sym].losses += 1;
        bySymbolWinLoss[sym].closed += 1;
      } else if (e.outcome === 'BE' || e.outcome === 'Breakeven') {
        bySymbolWinLoss[sym].be += 1;
        bySymbolWinLoss[sym].closed += 1;
      }

      // Agents
      if (e.agentName || e.agentId) {
        const key = e.agentName || e.agentId || 'Unknown';
        byAgent[key] = (byAgent[key] || 0) + 1;
      }

      // Source (ai/manual/imported)
      if ((e as any).source) {
        const src = (e as any).source as string;
        bySource[src] = (bySource[src] || 0) + 1;
      }

      // 🔢 PnL
      if (typeof e.pnl === 'number') {
        totalPnl += e.pnl;
        pnlCount += 1;
        bySymbolWinLoss[sym].pnl += e.pnl;
      }

      // 🔢 R:R
      if (typeof e.rr === 'number') {
        totalRR += e.rr;
        rrCount += 1;
      }
    }

    const winCount =
      (byOutcome['Win'] || 0) +
      (byOutcome['win'] || 0) +
      (byOutcome['WIN'] || 0);

    const lossCount =
      (byOutcome['Loss'] || 0) +
      (byOutcome['loss'] || 0) +
      (byOutcome['LOSS'] || 0);

    const beCount =
      (byOutcome['BE'] || 0) +
      (byOutcome['Breakeven'] || 0) +
      (byOutcome['breakeven'] || 0);

    const closedTrades = winCount + lossCount + beCount;
    const overallWinrate = closedTrades ? (winCount / closedTrades) * 100 : 0;

    const avgRR = rrCount ? totalRR / rrCount : 0;
    const avgPnlPerTrade = pnlCount ? totalPnl / pnlCount : 0;

    return {
      total,
      byOutcome,
      bySymbol,
      byAgent,
      bySource,
      // numeric metrics
      totalPnl,
      avgRR,
      overallWinrate,
      avgPnlPerTrade,
      bySymbolWinLoss,
    };
  }, [entries]);

  const sortRecord = (rec: Record<string, number>) =>
    Object.entries(rec).sort((a, b) => b[1] - a[1]);

  const sortSymbolsByClosed = Object.entries(stats.bySymbolWinLoss).sort(
    (a, b) => b[1].closed - a[1].closed
  );

  const formatNumber = (n: number, digits = 2) =>
    n.toLocaleString(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });

  return (
    <div className="h-full w-full flex flex-col bg-slate-950 text-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <h2 className="text-sm font-semibold">Trading Analytics</h2>
        <span className="text-xs opacity-70">
          {stats.total} journal entries
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-4 space-y-4 text-xs">
        {/* Overview cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg border border-white/10 p-3">
            <div className="text-[11px] opacity-70 mb-1">Total Notes</div>
            <div className="text-lg font-semibold">{stats.total}</div>
          </div>

          <div className="rounded-lg border border-white/10 p-3">
            <div className="text-[11px] opacity-70 mb-1">AI Notes</div>
            <div className="text-lg font-semibold">
              {stats.bySource['ai'] || 0}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 p-3">
            <div className="text-[11px] opacity-70 mb-1">Manual Notes</div>
            <div className="text-lg font-semibold">
              {stats.bySource['manual'] || 0}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 p-3">
            <div className="text-[11px] opacity-70 mb-1">Symbols Tracked</div>
            <div className="text-lg font-semibold">
              {Object.keys(stats.bySymbol).length}
            </div>
          </div>

          {/* 🔥 Total PnL */}
          <div className="rounded-lg border border-white/10 p-3 col-span-2 md:col-span-2">
            <div className="text-[11px] opacity-70 mb-1">Total Realized PnL</div>
            <div className="text-lg font-semibold">
              {stats.totalPnl >= 0 ? '+' : ''}
              {formatNumber(stats.totalPnl, 2)}
            </div>
            <div className="text-[10px] opacity-60 mt-1">
              Sum of all entries with a PnL value.
            </div>
          </div>

          {/* 🔥 Avg R:R */}
          <div className="rounded-lg border border-white/10 p-3">
            <div className="text-[11px] opacity-70 mb-1">Average R:R</div>
            <div className="text-lg font-semibold">
              {formatNumber(stats.avgRR, 2)}R
            </div>
          </div>

          {/* 🔥 Winrate */}
          <div className="rounded-lg border border-white/10 p-3">
            <div className="text-[11px] opacity-70 mb-1">Winrate</div>
            <div className="text-lg font-semibold">
              {formatNumber(stats.overallWinrate, 1)}%
            </div>
          </div>
        </div>

        {/* Outcome distribution */}
        <div className="rounded-lg border border-white/10 p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide opacity-70">
            Outcomes
          </div>

          {sortRecord(stats.byOutcome).length === 0 ? (
            <div className="text-[11px] opacity-60">
              No outcome data yet. As you tag trades as Win / Loss / BE / Open,
              this will fill in.
            </div>
          ) : (
            <div className="space-y-1">
              {sortRecord(stats.byOutcome).map(([name, count]) => {
                const pct = stats.total
                  ? Math.round((count / stats.total) * 100)
                  : 0;

                return (
                  <div key={name} className="flex items-center gap-2">
                    <div className="w-20 text-[11px] capitalize">{name}</div>
                    <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full bg-white/60"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="w-10 text-right text-[11px] opacity-70">
                      {pct}%
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Symbols (Top 5 by count) */}
        <div className="rounded-lg border border-white/10 p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide opacity-70">
            Symbols (Top 5 by Notes)
          </div>

          {sortRecord(stats.bySymbol).slice(0, 5).map(([sym, count]) => (
            <div key={sym} className="flex justify-between text-[11px] mb-1">
              <span>{sym}</span>
              <span className="opacity-70">{count}</span>
            </div>
          ))}

          {Object.keys(stats.bySymbol).length === 0 && (
            <div className="text-[11px] opacity-60">
              No symbols yet. As you log trades and notes, you&apos;ll see which
              markets you actually trade the most.
            </div>
          )}
        </div>

        {/* 🔥 Per-Symbol performance */}
        <div className="rounded-lg border border-white/10 p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide opacity-70">
            Per-Symbol Performance
          </div>

          {sortSymbolsByClosed.length === 0 ? (
            <div className="text-[11px] opacity-60">
              No closed trades yet. Once you start tagging trades with outcomes
              and PnL, you&apos;ll see winrate and performance by symbol here.
            </div>
          ) : (
            <div className="space-y-1">
              {sortSymbolsByClosed.map(([sym, perf]) => {
                const { wins, losses, be, closed, pnl } = perf;
                const winrate = closed ? (wins / closed) * 100 : 0;

                return (
                  <div
                    key={sym}
                    className="flex flex-col border border-white/5 rounded-md px-2 py-1"
                  >
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="font-semibold">{sym}</span>
                      <span className="opacity-70">
                        {closed} closed • {wins}W / {losses}L / {be}BE
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span>Winrate</span>
                      <span className="opacity-80">
                        {formatNumber(winrate, 1)}%
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span>Total PnL</span>
                      <span
                        className={
                          pnl >= 0 ? 'opacity-80' : 'opacity-80 text-red-300'
                        }
                      >
                        {pnl >= 0 ? '+' : ''}
                        {formatNumber(pnl, 2)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Agent contribution */}
        <div className="rounded-lg border border-white/10 p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide opacity-70">
            Agent Contribution
          </div>

          {Object.keys(stats.byAgent).length === 0 ? (
            <div className="text-[11px] opacity-60">
              Once the AI team starts logging journal entries, you&apos;ll see
              which agent is carrying the most weight.
            </div>
          ) : (
            sortRecord(stats.byAgent).map(([agent, count]) => (
              <div
                key={agent}
                className="flex justify-between text-[11px] mb-1"
              >
                <span>{agent}</span>
                <span className="opacity-70">{count}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default AnalyticsPanel;

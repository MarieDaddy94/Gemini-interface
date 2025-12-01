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

    for (const e of entries) {
      if (e.outcome) {
        byOutcome[e.outcome] = (byOutcome[e.outcome] || 0) + 1;
      }
      
      const sym = e.symbol || e.focusSymbol || 'Unknown';
      bySymbol[sym] = (bySymbol[sym] || 0) + 1;

      if (e.agentName || e.agentId) {
        const key = e.agentName || e.agentId || 'Unknown';
        byAgent[key] = (byAgent[key] || 0) + 1;
      }
      
      if (e.source) {
        bySource[e.source] = (bySource[e.source] || 0) + 1;
      }
    }

    return { total, byOutcome, bySymbol, byAgent, bySource };
  }, [entries]);

  const sortRecord = (rec: Record<string, number>) =>
    Object.entries(rec).sort((a, b) => b[1] - a[1]);

  return (
    <div className="h-full w-full flex flex-col bg-[#131722] text-[#d1d4dc]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2e39]">
        <h2 className="text-sm font-semibold text-white">Trading Analytics</h2>
        <span className="text-xs text-gray-400">
          {stats.total} journal entries
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-4 space-y-4 text-xs">
        {/* Overview cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg border border-[#2a2e39] bg-[#1e222d] p-3">
            <div className="text-[11px] text-gray-400 mb-1">Total Notes</div>
            <div className="text-lg font-semibold text-white">{stats.total}</div>
          </div>

          <div className="rounded-lg border border-[#2a2e39] bg-[#1e222d] p-3">
            <div className="text-[11px] text-gray-400 mb-1">AI Notes</div>
            <div className="text-lg font-semibold text-[#2962ff]">
              {stats.bySource['ai'] || 0}
            </div>
          </div>

          <div className="rounded-lg border border-[#2a2e39] bg-[#1e222d] p-3">
            <div className="text-[11px] text-gray-400 mb-1">Manual Notes</div>
            <div className="text-lg font-semibold text-white">
              {(stats.bySource['user'] || 0) + (stats.bySource['manual'] || 0)}
            </div>
          </div>

          <div className="rounded-lg border border-[#2a2e39] bg-[#1e222d] p-3">
            <div className="text-[11px] text-gray-400 mb-1">Symbols Tracked</div>
            <div className="text-lg font-semibold text-white">
              {Object.keys(stats.bySymbol).length}
            </div>
          </div>
        </div>

        {/* Outcome distribution */}
        <div className="rounded-lg border border-[#2a2e39] bg-[#1e222d] p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Outcomes
          </div>

          {sortRecord(stats.byOutcome).length === 0 ? (
            <div className="text-[11px] text-gray-500">
              No outcome data yet. As you tag trades as Win / Loss / Breakeven /
              Open, this will fill in.
            </div>
          ) : (
            <div className="space-y-2">
              {sortRecord(stats.byOutcome).map(([name, count]) => {
                const pct = stats.total
                  ? Math.round((count / stats.total) * 100)
                  : 0;

                let colorClass = 'bg-gray-500';
                if (name === 'Win') colorClass = 'bg-[#089981]';
                if (name === 'Loss') colorClass = 'bg-[#f23645]';
                if (name === 'BreakEven' || name === 'BE') colorClass = 'bg-yellow-500';
                if (name === 'Open') colorClass = 'bg-[#2962ff]';

                return (
                  <div key={name} className="flex items-center gap-2">
                    <div className="w-20 text-[11px] capitalize text-gray-300">{name}</div>
                    <div className="flex-1 h-1.5 rounded-full bg-[#2a2e39] overflow-hidden">
                      <div
                        className={`h-full ${colorClass}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="w-10 text-right text-[11px] text-gray-400">
                      {pct}%
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Symbols (Top 5) */}
        <div className="rounded-lg border border-[#2a2e39] bg-[#1e222d] p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Symbols (Top 5)
          </div>

          <div className="space-y-1">
            {sortRecord(stats.bySymbol).slice(0, 5).map(([sym, count]) => (
                <div
                key={sym}
                className="flex justify-between text-[11px] mb-1"
                >
                <span className="text-gray-300">{sym}</span>
                <span className="text-gray-500">{count}</span>
                </div>
            ))}
          </div>

          {Object.keys(stats.bySymbol).length === 0 && (
            <div className="text-[11px] text-gray-500">
              No symbols yet. As you log trades and notes, you&apos;ll see which
              markets you actually trade the most.
            </div>
          )}
        </div>

        {/* Agent contribution */}
        <div className="rounded-lg border border-[#2a2e39] bg-[#1e222d] p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Agent Contribution
          </div>

          <div className="space-y-1">
            {sortRecord(stats.byAgent).map(([agent, count]) => (
                <div
                key={agent}
                className="flex justify-between text-[11px] mb-1"
                >
                <span className="text-gray-300">{agent}</span>
                <span className="text-gray-500">{count}</span>
                </div>
            ))}
          </div>

          {Object.keys(stats.byAgent).length === 0 && (
            <div className="text-[11px] text-gray-500">
              Once the AI team starts logging journal entries, you&apos;ll see
              which agent is carrying the most weight.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnalyticsPanel;
import React, { useMemo, useState } from 'react';
import { useJournal } from '../context/JournalContext';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer, 
  Cell, 
  PieChart, 
  Pie,
  ReferenceLine
} from 'recharts';

const AnalyticsPanel: React.FC = () => {
  const { entries, clearJournal } = useJournal();
  const [showConfirmReset, setShowConfirmReset] = useState(false);

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

    const agentStats: Record<string, { count: number; pnl: number }> = {};

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

        // Rich stats
        if (!agentStats[key]) agentStats[key] = { count: 0, pnl: 0 };
        agentStats[key].count++;
        if (typeof e.pnl === 'number') agentStats[key].pnl += e.pnl;
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
      agentStats,
      bySource,
      // numeric metrics
      totalPnl,
      avgRR,
      overallWinrate,
      avgPnlPerTrade,
      bySymbolWinLoss,
      winCount,
      lossCount,
      beCount,
      closedTrades
    };
  }, [entries]);

  // --- Chart Data Preparation ---

  const pnlData = useMemo(() => {
    return Object.entries(stats.bySymbolWinLoss)
      .map(([symbol, data]: [string, { pnl: number; closed: number }]) => ({
        symbol,
        pnl: data.pnl,
        closed: data.closed
      }))
      .filter(d => d.closed > 0 && d.pnl !== 0) // Only show active symbols with PnL
      .sort((a, b) => b.pnl - a.pnl);
  }, [stats]);

  const outcomeData = useMemo(() => {
    return [
      { name: 'Win', value: stats.winCount, color: '#089981' },
      { name: 'Loss', value: stats.lossCount, color: '#f23645' },
      { name: 'BE', value: stats.beCount, color: '#787b86' },
    ].filter(d => d.value > 0);
  }, [stats]);

  const agentPerformanceData = useMemo(() => {
    return Object.entries(stats.agentStats)
      .map(([name, data]: [string, { pnl: number; count: number }]) => ({
        name,
        pnl: data.pnl,
        count: data.count
      }))
      .sort((a, b) => b.pnl - a.pnl);
  }, [stats]);

  const sortRecord = (rec: Record<string, number>) =>
    Object.entries(rec).sort((a, b) => b[1] - a[1]);

  const sortSymbolsByClosed = Object.entries(stats.bySymbolWinLoss).sort(
    (a: [string, { closed: number }], b: [string, { closed: number }]) => b[1].closed - a[1].closed
  );

  const formatNumber = (n: number, digits = 2) =>
    n.toLocaleString(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  
  const handleReset = () => {
    clearJournal();
    setShowConfirmReset(false);
  };

  return (
    <div className="h-full w-full flex flex-col bg-slate-950 text-slate-50 relative">
      {/* Confirmation Modal */}
      {showConfirmReset && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-[#1e222d] border border-red-500/30 rounded-lg shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="p-4 border-b border-white/5 flex items-center gap-3 bg-[#131722]">
              <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
              </div>
              <h3 className="font-semibold text-white">Reset Journal Data?</h3>
            </div>
            <div className="p-4 text-sm text-gray-300">
              <p>This will permanently delete all <span className="text-white font-medium">{stats.total}</span> journal entries and reset your analytics stats.</p>
              <p className="mt-2 text-red-400 text-xs flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                This action cannot be undone.
              </p>
            </div>
            <div className="p-3 bg-[#131722] flex justify-end gap-2 border-t border-white/5">
              <button 
                onClick={() => setShowConfirmReset(false)}
                className="px-3 py-1.5 rounded hover:bg-white/5 text-gray-400 text-xs font-medium transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleReset}
                className="px-3 py-1.5 rounded bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20 text-xs font-medium transition-colors"
              >
                Yes, Clear All Data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <h2 className="text-sm font-semibold">Trading Analytics</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs opacity-70">
            {stats.total} journal entries
          </span>
          {stats.total > 0 && (
             <button
               onClick={() => setShowConfirmReset(true)}
               className="text-[10px] text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 px-2 py-1 rounded bg-red-500/5 transition-colors flex items-center gap-1"
               title="Reset all journal data"
             >
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                Reset
             </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-4 space-y-4 text-xs">
        {/* KPI Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* 🔥 Total PnL (Spans 2 on desktop) */}
          <div className="rounded-lg border border-white/10 p-3 col-span-2 md:col-span-1">
            <div className="text-[11px] opacity-70 mb-1">Total Realized PnL</div>
            <div className={`text-xl font-bold ${stats.totalPnl > 0 ? 'text-[#089981]' : stats.totalPnl < 0 ? 'text-[#f23645]' : ''}`}>
              {stats.totalPnl > 0 ? '+' : ''}
              {formatNumber(stats.totalPnl, 2)}
            </div>
          </div>

          {/* 🔥 Winrate */}
          <div className="rounded-lg border border-white/10 p-3">
            <div className="text-[11px] opacity-70 mb-1">Winrate</div>
            <div className="text-xl font-bold">
              {formatNumber(stats.overallWinrate, 1)}%
            </div>
          </div>

          {/* 🔥 Avg R:R */}
          <div className="rounded-lg border border-white/10 p-3">
            <div className="text-[11px] opacity-70 mb-1">Avg R:R</div>
            <div className="text-xl font-bold">
              {formatNumber(stats.avgRR, 2)}R
            </div>
          </div>

          <div className="rounded-lg border border-white/10 p-3">
             <div className="text-[11px] opacity-70 mb-1">Total Trades</div>
             <div className="text-xl font-bold">{stats.total}</div>
          </div>
        </div>

        {/* 📊 Visual Charts Section */}
        {stats.total > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 h-52">
             {/* PnL by Symbol Bar Chart */}
             <div className="lg:col-span-2 rounded-lg border border-white/10 p-3 flex flex-col bg-[#161a25]">
                <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70 mb-2">PnL by Symbol</div>
                <div className="flex-1 min-h-0">
                  {pnlData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={pnlData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                        <XAxis 
                          dataKey="symbol" 
                          tick={{fontSize: 10, fill: '#64748b'}} 
                          axisLine={false} 
                          tickLine={false} 
                          interval={0}
                        />
                        <YAxis 
                          tick={{fontSize: 10, fill: '#64748b'}} 
                          axisLine={false} 
                          tickLine={false} 
                        />
                        <RechartsTooltip 
                            contentStyle={{ backgroundColor: '#1e222d', borderColor: '#2a2e39', color: '#d1d4dc', fontSize: '11px', borderRadius: '4px' }}
                            cursor={{fill: 'rgba(255,255,255,0.03)'}}
                            itemStyle={{ color: '#fff' }}
                            formatter={(value: number) => [`${value > 0 ? '+' : ''}${value.toFixed(2)}`, 'PnL']}
                        />
                        <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
                          {pnlData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? '#089981' : '#f23645'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-500 italic">
                      No PnL data available yet.
                    </div>
                  )}
                </div>
             </div>

             {/* Outcome Distribution Pie Chart */}
             <div className="rounded-lg border border-white/10 p-3 flex flex-col bg-[#161a25]">
                <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70 mb-2">Outcome Dist.</div>
                <div className="flex-1 min-h-0 relative">
                  {outcomeData.length > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={outcomeData}
                            cx="50%"
                            cy="50%"
                            innerRadius={35}
                            outerRadius={55}
                            paddingAngle={4}
                            dataKey="value"
                            stroke="none"
                          >
                            {outcomeData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <RechartsTooltip 
                             contentStyle={{ backgroundColor: '#1e222d', borderColor: '#2a2e39', color: '#d1d4dc', fontSize: '11px', borderRadius: '4px' }}
                             itemStyle={{ color: '#fff' }}
                             separator=": "
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                         <div className="text-center">
                           <div className="text-[10px] text-gray-400 uppercase">Win Rate</div>
                           <div className={`text-base font-bold ${stats.overallWinrate >= 50 ? 'text-[#089981]' : 'text-[#f23645]'}`}>
                             {stats.overallWinrate.toFixed(0)}%
                           </div>
                         </div>
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-500 italic">
                      No outcomes yet.
                    </div>
                  )}
                </div>
             </div>
          </div>
        )}

        {/* Breakdown Lists Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Symbols (Top 5 by count) */}
          <div className="rounded-lg border border-white/10 p-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide opacity-70">
              Symbols (Top 5 by Notes)
            </div>

            {sortRecord(stats.bySymbol).slice(0, 5).map(([sym, count]) => (
              <div key={sym} className="flex justify-between text-[11px] mb-1 py-1 border-b border-white/5 last:border-0">
                <span>{sym}</span>
                <span className="opacity-70 font-mono">{count}</span>
              </div>
            ))}

            {Object.keys(stats.bySymbol).length === 0 && (
              <div className="text-[11px] opacity-60">
                No symbols yet. As you log trades and notes, you&apos;ll see which
                markets you actually trade the most.
              </div>
            )}
          </div>

          {/* Agent contribution - Expanded to chart */}
          <div className="rounded-lg border border-white/10 p-3 flex flex-col bg-[#161a25]">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide opacity-70">
              Agent Performance (PnL)
            </div>
            
            <div className="flex-1 min-h-[150px]">
               {agentPerformanceData.length > 0 ? (
                 <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={agentPerformanceData} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                      <XAxis type="number" hide />
                      <YAxis 
                        dataKey="name" 
                        type="category" 
                        width={80} 
                        tick={{fontSize: 10, fill: '#9ca3af'}} 
                        axisLine={false} 
                        tickLine={false} 
                        interval={0}
                      />
                      <RechartsTooltip 
                          contentStyle={{ backgroundColor: '#1e222d', borderColor: '#2a2e39', color: '#d1d4dc', fontSize: '11px', borderRadius: '4px' }}
                          cursor={{fill: 'rgba(255,255,255,0.05)'}}
                          formatter={(val: number) => [`${val > 0 ? '+' : ''}${val.toFixed(2)}`, 'PnL']}
                      />
                      <ReferenceLine x={0} stroke="#2a2e39" />
                      <Bar dataKey="pnl" radius={[0, 4, 4, 0]} barSize={16}>
                        {agentPerformanceData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? '#3b82f6' : '#f23645'} />
                        ))}
                      </Bar>
                    </BarChart>
                 </ResponsiveContainer>
               ) : (
                 <div className="h-full flex flex-col items-center justify-center text-[11px] opacity-60 text-center">
                    <p>No agent data yet.</p>
                    <p className="text-[9px] mt-1">AI entries will appear here.</p>
                 </div>
               )}
            </div>
          </div>
        </div>

        {/* 🔥 Detailed Per-Symbol performance */}
        <div className="rounded-lg border border-white/10 p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide opacity-70">
            Performance Detail
          </div>

          {sortSymbolsByClosed.length === 0 ? (
            <div className="text-[11px] opacity-60">
              No closed trades yet. Once you start tagging trades with outcomes
              and PnL, you&apos;ll see winrate and performance by symbol here.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {sortSymbolsByClosed.map(([sym, perf]: [string, { wins: number; losses: number; be: number; closed: number; pnl: number }]) => {
                const { wins, losses, be, closed, pnl } = perf;
                const winrate = closed ? (wins / closed) * 100 : 0;

                return (
                  <div
                    key={sym}
                    className="flex items-center justify-between border border-white/5 bg-white/[0.02] rounded px-3 py-2 text-[11px]"
                  >
                    <div className="flex flex-col min-w-[80px]">
                      <span className="font-bold text-white text-xs">{sym}</span>
                      <span className="opacity-60 text-[10px]">{closed} trades</span>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5 opacity-80">
                         <span className="text-[#089981] font-medium">{wins}W</span>
                         <span className="text-[#f23645] font-medium">{losses}L</span>
                         <span className="text-gray-400">{be}BE</span>
                      </div>
                      
                      <div className="w-16 text-right">
                         <div className="text-[10px] opacity-50">Winrate</div>
                         <div className={`font-semibold ${winrate >= 50 ? 'text-[#089981]' : 'text-[#f23645]'}`}>
                            {winrate.toFixed(0)}%
                         </div>
                      </div>

                      <div className="w-20 text-right">
                         <div className="text-[10px] opacity-50">Net PnL</div>
                         <div className={`font-bold ${pnl > 0 ? 'text-[#089981]' : pnl < 0 ? 'text-[#f23645]' : 'text-gray-300'}`}>
                           {pnl > 0 ? '+' : ''}{formatNumber(pnl, 0)}
                         </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnalyticsPanel;
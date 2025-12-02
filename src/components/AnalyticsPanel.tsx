
import React, { useEffect, useState } from 'react';
import { apiClient } from '../utils/apiClient';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer, 
  Cell
} from 'recharts';

interface JournalStats {
  totalTrades: number;
  winRate: number;
  avgR: number;
  totalPnl: number;
  maxDrawdownR: number;
  playbookStats: Record<string, { count: number; wins: number; totalR: number }>;
}

const AnalyticsPanel: React.FC = () => {
  const [stats, setStats] = useState<JournalStats | null>(null);
  const [loading, setLoading] = useState(false);

  const loadStats = async () => {
    setLoading(true);
    try {
      const data = await apiClient.get<JournalStats>('/api/journal/stats');
      setStats(data);
    } catch (e) {
      console.error("Stats load failed", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  if (loading) return <div className="p-4 text-xs text-gray-500">Loading stats...</div>;
  if (!stats) return <div className="p-4 text-xs text-gray-500">No data available.</div>;

  const playbookData = Object.entries(stats.playbookStats).map(([name, s]) => ({
    name,
    count: s.count,
    avgR: s.count > 0 ? Number((s.totalR / s.count).toFixed(2)) : 0
  })).sort((a,b) => b.count - a.count);

  return (
    <div className="h-full w-full flex flex-col bg-slate-950 text-slate-50 relative p-4 overflow-auto">
      <div className="flex justify-between items-center mb-4">
         <h2 className="text-sm font-bold">Performance Analytics</h2>
         <button onClick={loadStats} className="text-[10px] text-blue-400">Refresh</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-[#1e222d] border border-white/10 rounded p-3">
           <div className="text-[10px] text-gray-400 uppercase">Total PnL</div>
           <div className={`text-xl font-bold ${stats.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
             ${stats.totalPnl.toFixed(2)}
           </div>
        </div>
        <div className="bg-[#1e222d] border border-white/10 rounded p-3">
           <div className="text-[10px] text-gray-400 uppercase">Win Rate</div>
           <div className="text-xl font-bold text-white">{(stats.winRate * 100).toFixed(1)}%</div>
        </div>
        <div className="bg-[#1e222d] border border-white/10 rounded p-3">
           <div className="text-[10px] text-gray-400 uppercase">Avg R</div>
           <div className="text-xl font-bold text-blue-400">{stats.avgR}R</div>
        </div>
        <div className="bg-[#1e222d] border border-white/10 rounded p-3">
           <div className="text-[10px] text-gray-400 uppercase">Trades</div>
           <div className="text-xl font-bold text-gray-300">{stats.totalTrades}</div>
        </div>
      </div>

      <div className="bg-[#161a25] border border-white/10 rounded p-4 h-64 flex flex-col">
         <h3 className="text-xs font-bold text-gray-400 mb-2 uppercase">Performance by Playbook (Avg R)</h3>
         {playbookData.length > 0 ? (
           <ResponsiveContainer width="100%" height="100%">
             <BarChart data={playbookData} layout="vertical" margin={{ left: 10, right: 30 }}>
               <XAxis type="number" hide />
               <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 10, fill: '#9ca3af'}} />
               <RechartsTooltip 
                 contentStyle={{ backgroundColor: '#1e222d', borderColor: '#2a2e39', color: '#d1d4dc', fontSize: '11px' }}
                 cursor={{fill: 'rgba(255,255,255,0.05)'}}
               />
               <Bar dataKey="avgR" barSize={20} radius={[0, 4, 4, 0]}>
                 {playbookData.map((entry, index) => (
                   <Cell key={`cell-${index}`} fill={entry.avgR >= 0 ? '#3b82f6' : '#f23645'} />
                 ))}
               </Bar>
             </BarChart>
           </ResponsiveContainer>
         ) : (
           <div className="flex-1 flex items-center justify-center text-gray-500 text-xs">No playbooks logged yet.</div>
         )}
      </div>
    </div>
  );
};

export default AnalyticsPanel;

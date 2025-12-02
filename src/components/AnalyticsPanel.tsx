
import React, { useEffect, useState } from 'react';
import { apiClient } from '../utils/apiClient';
import { performanceApi, PlaybookProfile } from '../services/performanceApi';
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
  const [profiles, setProfiles] = useState<PlaybookProfile[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsData, profilesData] = await Promise.all([
        apiClient.get<JournalStats>('/api/journal/stats'),
        performanceApi.getPlaybooks()
      ]);
      setStats(statsData);
      setProfiles(profilesData);
    } catch (e) {
      console.error("Stats load failed", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) return <div className="p-4 text-xs text-gray-500">Loading analytics...</div>;
  if (!stats) return <div className="p-4 text-xs text-gray-500">No data available.</div>;

  return (
    <div className="h-full w-full flex flex-col bg-slate-950 text-slate-50 relative p-4 overflow-auto">
      <div className="flex justify-between items-center mb-4">
         <h2 className="text-sm font-bold">Performance Analytics</h2>
         <button onClick={loadData} className="text-[10px] text-blue-400">Refresh</button>
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

      {/* Playbook Health Table */}
      <div className="bg-[#161a25] border border-white/10 rounded p-4 mb-6">
         <h3 className="text-xs font-bold text-gray-400 mb-3 uppercase">Playbook Health (90 Days)</h3>
         <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
               <thead className="text-[10px] text-gray-500 uppercase border-b border-gray-700">
                  <tr>
                     <th className="pb-2">Playbook</th>
                     <th className="pb-2">Symbol</th>
                     <th className="pb-2 text-right">Trades</th>
                     <th className="pb-2 text-right">Win%</th>
                     <th className="pb-2 text-right">Avg R</th>
                     <th className="pb-2 text-right">Status</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-gray-800">
                  {profiles.map((p, idx) => (
                     <tr key={idx} className="hover:bg-white/5">
                        <td className="py-2 font-medium text-white">{p.playbook}</td>
                        <td className="py-2 text-gray-400">{p.symbol}</td>
                        <td className="py-2 text-right">{p.sampleSize}</td>
                        <td className="py-2 text-right text-gray-300">{(p.winRate * 100).toFixed(0)}%</td>
                        <td className={`py-2 text-right ${p.avgR > 0 ? 'text-blue-400' : 'text-red-400'}`}>{p.avgR.toFixed(2)}</td>
                        <td className="py-2 text-right">
                           <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold ${
                              p.health === 'green' ? 'bg-emerald-500/20 text-emerald-400' :
                              p.health === 'red' ? 'bg-red-500/20 text-red-400' :
                              p.health === 'amber' ? 'bg-amber-500/20 text-amber-400' :
                              'bg-gray-700 text-gray-400'
                           }`}>
                              {p.health}
                           </span>
                        </td>
                     </tr>
                  ))}
               </tbody>
            </table>
            {profiles.length === 0 && <div className="text-center text-gray-500 py-4 text-xs">No enough data to profile playbooks yet.</div>}
         </div>
      </div>
    </div>
  );
};

export default AnalyticsPanel;

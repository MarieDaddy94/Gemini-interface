
import React from 'react';
import { Playbook } from '../types';

interface Props {
  playbook: Playbook;
  onClick?: () => void;
  onRefreshStats?: (id: string) => void;
}

const tierColors: Record<string, string> = {
  A: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
  B: "bg-blue-500/20 text-blue-400 border-blue-500/40",
  C: "bg-gray-700/50 text-gray-400 border-gray-600",
  experimental: "bg-purple-500/20 text-purple-400 border-purple-500/40"
};

const PlaybookCard: React.FC<Props> = ({ playbook, onClick, onRefreshStats }) => {
  const stats = playbook.performance;
  const winRate = stats.trades > 0 ? (stats.wins / stats.trades * 100).toFixed(0) : "0";

  return (
    <div 
      className="rounded-lg border border-gray-800 bg-[#161a25] p-3 cursor-pointer hover:border-gray-600 transition-all flex flex-col gap-2 relative group"
      onClick={onClick}
    >
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold border ${tierColors[playbook.tier] || tierColors.C}`}>
              {playbook.tier}
            </span>
            <span className="text-[10px] text-gray-500 font-mono">{playbook.symbol} {playbook.timeframe}</span>
          </div>
          <h3 className="font-bold text-sm text-gray-200 leading-snug">{playbook.name}</h3>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 mt-1">
        {playbook.tags.slice(0, 3).map((t, i) => (
          <span key={i} className="px-1.5 py-0.5 bg-black/40 text-gray-400 text-[9px] rounded">{t}</span>
        ))}
      </div>

      <div className="mt-auto pt-3 border-t border-white/5 grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-[9px] text-gray-500 uppercase">Trades</div>
          <div className="text-xs font-mono text-gray-300">{stats.trades}</div>
        </div>
        <div>
          <div className="text-[9px] text-gray-500 uppercase">Win Rate</div>
          <div className={`text-xs font-mono font-bold ${Number(winRate) > 50 ? 'text-green-400' : 'text-gray-300'}`}>
            {winRate}%
          </div>
        </div>
        <div>
          <div className="text-[9px] text-gray-500 uppercase">Avg R</div>
          <div className={`text-xs font-mono ${stats.avgR > 0 ? 'text-blue-400' : 'text-red-400'}`}>
            {stats.avgR.toFixed(2)}
          </div>
        </div>
      </div>

      {onRefreshStats && (
        <button 
          className="absolute top-2 right-2 p-1 text-gray-600 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            onRefreshStats(playbook.id);
          }}
          title="Refresh Stats"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/></svg>
        </button>
      )}
    </div>
  );
};

export default PlaybookCard;

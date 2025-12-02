
import React, { useState } from 'react';
import { useDesk } from '../context/DeskContext';

const DeskPolicyPanel: React.FC = () => {
  const { state: { activePolicy }, actions: { updateDeskPolicy, regenerateDeskPolicy } } = useDesk();
  const [loading, setLoading] = useState(false);

  if (!activePolicy) return <div className="text-xs text-gray-500 p-2">Loading policy...</div>;

  const isEnforced = activePolicy.mode === 'enforced';

  const toggleMode = async () => {
      setLoading(true);
      try {
          await updateDeskPolicy({ mode: isEnforced ? 'advisory' : 'enforced' });
      } finally {
          setLoading(false);
      }
  };

  const handleRegenerate = async () => {
      setLoading(true);
      try {
          await regenerateDeskPolicy();
      } finally {
          setLoading(false);
      }
  };

  return (
    <div className="bg-[#101216] border-t border-gray-800 p-3 flex flex-col gap-3">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-300 uppercase tracking-wide">Desk Policy</span>
                <span className="text-[10px] text-gray-500 font-mono">({activePolicy.date})</span>
            </div>
            <div className="flex items-center gap-2">
                <button 
                    onClick={handleRegenerate}
                    disabled={loading}
                    className="text-[10px] text-blue-400 hover:text-blue-300"
                >
                    {loading ? '...' : 'Regenerate'}
                </button>
                <div 
                    onClick={toggleMode}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer border select-none ${
                        isEnforced 
                        ? 'bg-red-500/10 border-red-500/30 text-red-300' 
                        : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    }`}
                >
                    <span className={`w-1.5 h-1.5 rounded-full ${isEnforced ? 'bg-red-500' : 'bg-emerald-500'}`}></span>
                    <span className="text-[9px] font-bold uppercase">{activePolicy.mode}</span>
                </div>
            </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="bg-black/20 p-2 rounded border border-gray-800">
                <div className="text-gray-500 text-[9px] uppercase">Max Risk / Trade</div>
                <div className="font-mono text-white font-bold">{activePolicy.maxRiskPerTrade}%</div>
            </div>
            <div className="bg-black/20 p-2 rounded border border-gray-800">
                <div className="text-gray-500 text-[9px] uppercase">Daily Stop</div>
                <div className="font-mono text-white font-bold">{activePolicy.maxDailyLossR}R</div>
            </div>
        </div>

        <div>
            <div className="text-gray-500 text-[9px] uppercase mb-1">Allowed Playbooks</div>
            <div className="flex flex-wrap gap-1">
                {activePolicy.allowedPlaybooks.map((pb, i) => (
                    <span key={i} className="px-1.5 py-0.5 bg-blue-900/20 text-blue-300 border border-blue-800/40 rounded text-[9px]">
                        {pb === '*' ? 'ALL ALLOWED' : pb}
                    </span>
                ))}
            </div>
        </div>

        <div className="bg-black/20 p-2 rounded border border-gray-800 text-[10px] text-gray-400 leading-snug whitespace-pre-wrap">
            {activePolicy.notes}
        </div>
    </div>
  );
};

export default DeskPolicyPanel;

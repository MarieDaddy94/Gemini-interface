
import React, { useState, useEffect } from 'react';
import { useDesk } from '../context/DeskContext';
import { DefenseMode, RiskState } from '../types';

const modeColors: Record<DefenseMode, string> = {
  normal: 'bg-emerald-500 text-black',
  caution: 'bg-yellow-500 text-black',
  defense: 'bg-orange-500 text-black',
  lockdown: 'bg-red-600 text-white animate-pulse'
};

const riskLabels: Record<RiskState, string> = {
  normal: 'Standard Risk',
  warming: 'Warming Up',
  hot: 'Hot Streak',
  tilt_risk: 'Tilt Warning',
  lockdown: 'Locked'
};

const DeskStateIndicator: React.FC = () => {
  const { state: { tiltState }, actions: { refreshTiltState } } = useDesk();
  const [showDetails, setShowDetails] = useState(false);

  // Poll refresh every 30s
  useEffect(() => {
      const interval = setInterval(refreshTiltState, 30000);
      return () => clearInterval(interval);
  }, [refreshTiltState]);

  if (!tiltState) return null;

  return (
    <div className="relative">
      <button 
        onClick={() => setShowDetails(!showDetails)}
        className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 transition-all shadow-md ${modeColors[tiltState.defenseMode]}`}
      >
        <span>Desk State: {tiltState.defenseMode}</span>
        {tiltState.defenseMode !== 'normal' && (
            <span className="bg-black/20 px-1.5 rounded text-[9px]">{riskLabels[tiltState.riskState]}</span>
        )}
      </button>

      {showDetails && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-[#1e222d] border border-gray-700 rounded shadow-xl z-50 p-3 text-xs">
            <div className="font-bold text-gray-200 mb-2 border-b border-gray-700 pb-1 flex justify-between items-center">
                <span>Defense Status</span>
                <button onClick={refreshTiltState} className="text-blue-400 text-[10px]">Refresh</button>
            </div>
            
            <div className="space-y-2">
                <div>
                    <div className="text-gray-500 text-[10px]">Risk State</div>
                    <div className="text-white capitalize">{tiltState.riskState.replace('_', ' ')}</div>
                </div>
                
                {tiltState.tiltSignals.length > 0 ? (
                    <div>
                        <div className="text-gray-500 text-[10px] mb-1">Active Signals</div>
                        <ul className="space-y-1">
                            {tiltState.tiltSignals.map((s, i) => (
                                <li key={i} className="bg-red-500/10 text-red-300 p-1.5 rounded border border-red-500/20 text-[10px]">
                                    <span className="font-bold block mb-0.5 capitalize">{s.reason.replace(/_/g, ' ')}</span>
                                    <span className="opacity-80">{s.details}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : (
                    <div className="text-green-400 italic">No negative signals detected.</div>
                )}

                {tiltState.defenseMode === 'lockdown' && (
                    <div className="mt-2 p-2 bg-red-600/20 border border-red-500 text-white rounded text-center">
                        ⛔ Trading Locked. Please begin recovery protocol.
                    </div>
                )}
            </div>
        </div>
      )}
    </div>
  );
};

export default DeskStateIndicator;

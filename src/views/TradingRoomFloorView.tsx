
import React from 'react';
import { useDesk, DeskRoleId } from '../context/DeskContext';

const roleColors: Record<DeskRoleId, string> = {
  strategist: 'bg-indigo-500/20 border-indigo-500/40 text-indigo-200',
  risk: 'bg-red-500/20 border-red-500/40 text-red-200',
  pattern: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200',
  quant: 'bg-blue-500/20 border-blue-500/40 text-blue-200',
  execution: 'bg-amber-500/20 border-amber-500/40 text-amber-200',
  journal: 'bg-purple-500/20 border-purple-500/40 text-purple-200',
};

const TradingRoomFloorView: React.FC = () => {
  const { deskState, setSessionPhase, toggleRoleOnDesk } = useDesk();
  const { deskName, goal, sessionPhase, roles } = deskState;

  // Derived list of active vs bench agents
  const activeRoles = Object.values(roles).filter(r => r.onDesk);
  const benchRoles = Object.values(roles).filter(r => !r.onDesk);

  return (
    <div className="flex h-full bg-[#0b0e14] text-gray-200 overflow-hidden">
      {/* LEFT: Desk Overview & Agents */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-gray-800">
        
        {/* Header Bar */}
        <div className="h-14 px-6 border-b border-gray-800 flex items-center justify-between bg-[#131722] shrink-0">
          <div>
            <h2 className="font-bold text-lg text-white">{deskName}</h2>
            <div className="text-xs text-gray-400 flex items-center gap-2">
              <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                sessionPhase === 'live' ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-300'
              }`}>
                {sessionPhase}
              </span>
              <span>Goal: {goal}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setSessionPhase('preSession')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${sessionPhase === 'preSession' ? 'bg-blue-600 text-white' : 'hover:bg-gray-800 text-gray-400'}`}
            >
              Pre
            </button>
            <button 
              onClick={() => setSessionPhase('live')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${sessionPhase === 'live' ? 'bg-red-600 text-white animate-pulse' : 'hover:bg-gray-800 text-gray-400'}`}
            >
              LIVE
            </button>
            <button 
              onClick={() => setSessionPhase('postSession')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${sessionPhase === 'postSession' ? 'bg-purple-600 text-white' : 'hover:bg-gray-800 text-gray-400'}`}
            >
              Post
            </button>
          </div>
        </div>

        {/* Agent Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeRoles.map((role) => (
              <div key={role.id} className={`rounded-lg border p-4 flex flex-col gap-2 shadow-sm transition-all hover:bg-white/[0.02] ${roleColors[role.id]}`}>
                <div className="flex justify-between items-start">
                  <div className="font-bold text-sm uppercase tracking-wide">{role.label}</div>
                  <div className={`w-2 h-2 rounded-full ${role.status === 'scanning' ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
                </div>
                
                <div className="text-xs space-y-1 mt-1">
                  <div className="flex items-center justify-between text-white/60">
                    <span>Focus:</span>
                    <span className="text-white font-mono">{role.symbolFocus || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between text-white/60">
                    <span>TF:</span>
                    <span className="text-white font-mono">{role.timeframes.join(', ') || '—'}</span>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-white/10">
                  <div className="text-[10px] uppercase text-white/40 mb-1 font-bold">Latest Update</div>
                  <div className="text-xs leading-relaxed italic opacity-90">
                    "{role.lastUpdate || 'No updates yet.'}"
                  </div>
                </div>
                
                <div className="mt-auto pt-2 flex justify-end">
                   <button 
                     onClick={() => toggleRoleOnDesk(role.id, false)}
                     className="text-[10px] text-white/40 hover:text-white/80 transition-colors"
                   >
                     Send to Bench
                   </button>
                </div>
              </div>
            ))}
            
            {/* Add Agent Button / Bench */}
            <div className="rounded-lg border border-dashed border-gray-700 p-4 flex flex-col items-center justify-center gap-2 text-gray-500 bg-gray-900/20">
               <span className="text-xs uppercase font-bold tracking-wide">Bench ({benchRoles.length})</span>
               <div className="flex flex-wrap justify-center gap-2">
                 {benchRoles.map(r => (
                   <button 
                     key={r.id}
                     onClick={() => toggleRoleOnDesk(r.id, true)}
                     className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs border border-gray-600 transition-colors"
                   >
                     + {r.label}
                   </button>
                 ))}
                 {benchRoles.length === 0 && <span className="text-[10px] opacity-50">All agents active</span>}
               </div>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT: Coordinator / Desk Chat */}
      <div className="w-[400px] flex flex-col border-l border-gray-800 bg-[#0e1118]">
        <div className="h-14 border-b border-gray-800 flex items-center px-4 shrink-0 bg-[#131722]">
           <h3 className="font-bold text-sm text-gray-300">Desk Coordinator</h3>
        </div>
        
        <div className="flex-1 p-4 flex items-center justify-center text-gray-500 text-xs italic">
           Coordinator Agent coming in Phase C...
        </div>

        <div className="p-4 border-t border-gray-800 bg-[#131722]">
           <input 
             disabled 
             placeholder="Ping the desk..." 
             className="w-full bg-[#0b0e14] border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
           />
        </div>
      </div>
    </div>
  );
};

export default TradingRoomFloorView;

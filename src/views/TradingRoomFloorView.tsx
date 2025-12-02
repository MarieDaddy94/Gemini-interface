
import React, { useState } from 'react';
import { useDesk, DeskRoleId, DeskSessionPhase } from '../context/DeskContext';

const roleColors: Record<DeskRoleId, string> = {
  strategist: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-200',
  risk: 'bg-red-500/10 border-red-500/30 text-red-200',
  pattern: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200',
  quant: 'bg-blue-500/10 border-blue-500/30 text-blue-200',
  execution: 'bg-amber-500/10 border-amber-500/30 text-amber-200',
  journal: 'bg-purple-500/10 border-purple-500/30 text-purple-200',
  news: 'bg-orange-500/10 border-orange-500/30 text-orange-200',
};

const TradingRoomFloorView: React.FC = () => {
  const {
    state: { deskName, goal, sessionPhase, roles },
    actions: { setDeskGoal, setSessionPhase, assignRole },
  } = useDesk();

  const [draftGoal, setDraftGoal] = useState(goal ?? "");

  const saveGoal = () => setDeskGoal(draftGoal);

  // Derived list of active vs bench agents
  const activeRoles = Object.values(roles).filter(r => r.onDesk);
  const benchRoles = Object.values(roles).filter(r => !r.onDesk);

  return (
    <div className="flex h-full bg-[#0b0e14] text-gray-200 overflow-hidden">
      {/* LEFT: Desk Overview & Agents */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-gray-800">
        
        {/* Top Bar: Desk Config */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-[#131722] shrink-0">
          <div className="flex flex-col gap-1">
            <div className="font-bold text-sm text-white flex items-center gap-2">
               {deskName}
               <span className="px-2 py-0.5 rounded text-[9px] bg-gray-700 text-gray-300 uppercase tracking-wider font-medium">
                 {sessionPhase}
               </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500">Goal:</span>
              <input
                className="bg-[#0b0e14] border border-gray-700 rounded px-2 py-1 text-gray-200 w-[300px] focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="Set a daily goal (e.g. 2R profit, no tilt)..."
                value={draftGoal}
                onChange={(e) => setDraftGoal(e.target.value)}
                onBlur={saveGoal}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                      saveGoal();
                      (e.target as HTMLInputElement).blur();
                  }
                }}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex bg-[#0b0e14] rounded p-1 border border-gray-700">
               {(['preSession', 'live', 'cooldown', 'postSession'] as DeskSessionPhase[]).map(phase => (
                 <button
                   key={phase}
                   onClick={() => setSessionPhase(phase)}
                   className={`px-3 py-1 rounded text-[10px] font-medium transition-colors uppercase ${
                     sessionPhase === phase
                       ? 'bg-blue-600 text-white shadow-sm'
                       : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
                   }`}
                 >
                   {phase === 'preSession' ? 'Pre' : phase === 'postSession' ? 'Post' : phase}
                 </button>
               ))}
            </div>
          </div>
        </div>

        {/* Agent Grid */}
        <div className="flex-1 overflow-y-auto p-4 bg-[#0b0e14]">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeRoles.map((role) => (
              <div 
                key={role.id} 
                className={`rounded-lg border p-4 flex flex-col gap-3 shadow-sm transition-all ${roleColors[role.id]}`}
              >
                <div className="flex justify-between items-center">
                  <div className="font-bold text-sm uppercase tracking-wide flex items-center gap-2">
                    {role.label}
                  </div>
                  <span
                    className={
                      "px-2 py-0.5 text-[9px] rounded-full border font-semibold uppercase " +
                      (role.status === "alert"
                        ? "border-red-500/50 text-red-400 bg-red-900/20 animate-pulse"
                        : role.status === "scanning"
                        ? "border-emerald-500/50 text-emerald-400 bg-emerald-900/20"
                        : role.status === "busy"
                        ? "border-blue-500/50 text-blue-400 bg-blue-900/20"
                        : "border-gray-600 text-gray-400 bg-gray-800/50")
                    }
                  >
                    {role.status}
                  </span>
                </div>
                
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-white/60 bg-black/20 px-2 py-1 rounded">
                    <span>Focus</span>
                    <span className="font-mono text-white">{role.symbolFocus || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-white/60 bg-black/20 px-2 py-1 rounded">
                    <span>Timeframes</span>
                    <span className="font-mono text-white">{role.timeframes.join(', ') || '—'}</span>
                  </div>
                </div>

                <div className="mt-auto pt-3 border-t border-white/10">
                  <div className="text-[9px] uppercase text-white/40 mb-1 font-bold tracking-wider">Latest Update</div>
                  <div className="text-xs leading-relaxed italic opacity-90 min-h-[2.5em]">
                    "{role.lastUpdate || 'No updates yet.'}"
                  </div>
                </div>
                
                <div className="flex justify-end mt-1">
                   <button 
                     onClick={() => assignRole(role.id, { onDesk: false })}
                     className="text-[10px] text-white/30 hover:text-white/80 transition-colors flex items-center gap-1"
                   >
                     <span>Bench Agent</span>
                     <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                   </button>
                </div>
              </div>
            ))}
            
            {/* Add Agent Button / Bench */}
            <div className="rounded-lg border border-dashed border-gray-800 p-4 flex flex-col items-center justify-center gap-3 text-gray-500 bg-[#101216] min-h-[200px]">
               <span className="text-xs uppercase font-bold tracking-wide opacity-70">Available Agents ({benchRoles.length})</span>
               <div className="flex flex-wrap justify-center gap-2">
                 {benchRoles.map(r => (
                   <button 
                     key={r.id}
                     onClick={() => assignRole(r.id, { onDesk: true })}
                     className="px-3 py-1.5 rounded bg-[#1e222d] hover:bg-[#2a2e39] text-xs border border-gray-700 text-gray-300 transition-all shadow-sm hover:shadow flex items-center gap-1"
                   >
                     <span>+</span> {r.label}
                   </button>
                 ))}
                 {benchRoles.length === 0 && <span className="text-[10px] opacity-40 italic">All agents active on desk</span>}
               </div>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT: Coordinator / Desk Chat */}
      <div className="w-[380px] flex flex-col border-l border-gray-800 bg-[#0e1118]">
        <div className="h-14 border-b border-gray-800 flex items-center justify-between px-4 shrink-0 bg-[#131722]">
           <div className="flex items-center gap-2">
             <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
             <h3 className="font-bold text-sm text-gray-200">Desk Coordinator</h3>
           </div>
           <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">AI Assistant</span>
        </div>
        
        <div className="flex-1 p-6 flex flex-col items-center justify-center text-gray-600 gap-3">
           <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="opacity-20"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
           <div className="text-center">
             <p className="text-xs font-medium">Coordinator Chat Offline</p>
             <p className="text-[10px] mt-1 opacity-70 max-w-[200px]">
               In Phase C, this will be a live chat where you direct the desk and get status reports.
             </p>
           </div>
        </div>

        <div className="p-4 border-t border-gray-800 bg-[#131722]">
           <div className="relative">
             <input 
               disabled 
               placeholder="Ping the desk (Coming Soon)..." 
               className="w-full bg-[#0b0e14] border border-gray-700 rounded px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed pl-3 pr-10"
             />
             <button disabled className="absolute right-2 top-2 text-gray-600">
               <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
             </button>
           </div>
           <div className="text-[9px] text-gray-600 mt-2 text-center">
             Example: "Switch focus to NAS100 for PM session"
           </div>
        </div>
      </div>
    </div>
  );
};

export default TradingRoomFloorView;

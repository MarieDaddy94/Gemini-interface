
import React, { useState, useEffect } from 'react';
import { useDesk, DeskRoleId, DeskSessionPhase } from '../context/DeskContext';
import { apiClient } from '../utils/apiClient';
import { performanceApi, DeskInsights } from '../services/performanceApi';
import VoiceRoomBar from '../components/VoiceRoomBar';
import DeskPolicyPanel from '../components/DeskPolicyPanel'; 
import DeskStateIndicator from '../components/DeskStateIndicator'; 
import { ActivePlaybook } from '../types';

const roleColors: Record<DeskRoleId, string> = {
  strategist: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-200',
  risk: 'bg-red-500/10 border-red-500/30 text-red-200',
  pattern: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200',
  quant: 'bg-blue-500/10 border-blue-500/30 text-blue-200',
  execution: 'bg-amber-500/10 border-amber-500/30 text-amber-200',
  journal: 'bg-purple-500/10 border-purple-500/30 text-purple-200',
  news: 'bg-orange-500/10 border-orange-500/30 text-orange-200',
};

type DeskChatMessage = {
  id: string;
  author: "you" | "desk";
  text: string;
  ts: number;
};

const TradingRoomFloorView: React.FC = () => {
  const {
    state: deskState,
    actions: { setDeskGoal, setSessionPhase, assignRole, updateRoleStatus, updateActivePlaybooks, toggleHalt },
  } = useDesk();

  const { deskName, goal, sessionPhase, roles, activePlaybooks, currentSession, tradingHalted } = deskState;

  const [draftGoal, setDraftGoal] = useState(goal ?? "");
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<DeskChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [insights, setInsights] = useState<DeskInsights | null>(null);

  const saveGoal = () => setDeskGoal(draftGoal);

  useEffect(() => {
    // Only load insights if not already loaded recently (optimization)
    const loadInsights = async () => {
        try {
            const data = await performanceApi.getDeskInsights();
            setInsights(data);
        } catch(e) {
            console.error(e);
        }
    };
    loadInsights();
    const interval = setInterval(loadInsights, 60000); 
    return () => clearInterval(interval);
  }, []);

  const activeRoles = Object.values(roles).filter(r => r.onDesk);
  const benchRoles = Object.values(roles).filter(r => !r.onDesk);

  const sendToDesk = async () => {
    const trimmed = chatInput.trim();
    if (!trimmed || isSending) return;

    const userMsg: DeskChatMessage = {
      id: `${Date.now()}-you`,
      author: "you",
      text: trimmed,
      ts: Date.now(),
    };

    setMessages((prev) => [userMsg, ...prev]);
    setChatInput("");
    setIsSending(true);

    try {
      const payload = {
        input: trimmed,
        deskState, 
      };

      const res = await apiClient.post<{
        message: string;
        roleUpdates?: Array<{
          roleId: DeskRoleId;
          status?: string;
          lastUpdate?: string;
        }>;
        sessionPhase?: DeskSessionPhase;
        goal?: string;
        activePlaybooks?: ActivePlaybook[];
      }>('/api/desk/roundup', payload); // Ensure correct path prefix

      const deskText: string =
        res.message ||
        "Desk processed your request (no message provided from coordinator).";

      const deskMsg: DeskChatMessage = {
        id: `${Date.now()}-desk`,
        author: "desk",
        text: deskText,
        ts: Date.now(),
      };

      setMessages((prev) => [deskMsg, ...prev]);

      if (Array.isArray(res.roleUpdates)) {
        res.roleUpdates.forEach((update) => {
          const roleId = update.roleId;
          if (!roleId || !roles[roleId]) return;

          const status = update.status as any;
          const lastUpdate = update.lastUpdate;
          
          updateRoleStatus(roleId, {
            ...(status && { status }),
            ...(lastUpdate && { lastUpdate }),
          });
        });
      }

      if (res.sessionPhase && res.sessionPhase !== sessionPhase) {
        setSessionPhase(res.sessionPhase);
      }
      if (typeof res.goal === "string" && res.goal !== goal) {
        setDeskGoal(res.goal);
        setDraftGoal(res.goal); 
      }
      if (res.activePlaybooks) {
          updateActivePlaybooks(res.activePlaybooks);
      }
    } catch (err) {
      console.error("Desk roundup error", err);
      const errMsg: DeskChatMessage = {
        id: `${Date.now()}-desk-error`,
        author: "desk",
        text: "⚠️ The desk could not process that request. Check server logs.",
        ts: Date.now(),
      };
      setMessages((prev) => [errMsg, ...prev]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex h-full bg-[#0b0e14] text-gray-200 overflow-hidden flex-col relative">
      {/* HALT OVERLAY */}
      {tradingHalted && (
          <div className="absolute inset-0 z-50 bg-red-950/80 backdrop-blur-sm flex items-center justify-center animate-fade-in">
              <div className="bg-red-900 border-2 border-red-500 rounded-lg p-10 text-center shadow-2xl max-w-lg">
                  <div className="mb-4 text-red-500">
                     <svg className="w-20 h-20 mx-auto animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                  </div>
                  <h1 className="text-4xl font-black text-white mb-2 tracking-tight">TRADING HALTED</h1>
                  <p className="text-red-200 mb-8 font-medium">Emergency Kill Switch is Active. All execution protocols suspended.</p>
                  <button 
                    onClick={toggleHalt}
                    className="px-8 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded shadow-lg transition-transform hover:scale-105"
                  >
                      RESUME OPERATIONS
                  </button>
              </div>
          </div>
      )}

      <VoiceRoomBar />

      <div className="flex-1 flex overflow-hidden">
        {/* LEFT: Desk Overview & Agents */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-gray-800">
            
            <div className="flex flex-col border-b border-gray-800 bg-[#131722] shrink-0">
                <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800/50">
                    <div className="flex flex-col gap-1">
                        <div className="font-bold text-sm text-white flex items-center gap-2">
                        {deskName}
                        <span className="px-2 py-0.5 rounded text-[9px] bg-gray-700 text-gray-300 uppercase tracking-wider font-medium">
                            {sessionPhase}
                        </span>
                        {currentSession?.gameplan && (
                            <span className={`px-2 py-0.5 rounded text-[9px] uppercase tracking-wider font-bold ${currentSession.gameplan.executionMode === 'sim' ? 'bg-blue-600 text-white' : 'bg-emerald-600 text-white animate-pulse'}`}>
                                {currentSession.gameplan.executionMode}
                            </span>
                        )}
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
                        <button 
                            onClick={toggleHalt}
                            className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider shadow-lg transition-all ${tradingHalted ? 'bg-gray-700 text-gray-400' : 'bg-red-600 text-white hover:bg-red-500'}`}
                        >
                            {tradingHalted ? 'RESUME' : 'HALT DESK'}
                        </button>

                        <DeskStateIndicator />
                        
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

                {/* Desk Insights & Active Playbooks */}
                <div className="px-4 py-1.5 flex items-center gap-4 bg-[#080812] text-[10px] overflow-hidden">
                    <span className="font-bold text-gray-500 uppercase tracking-wider">Active Playbooks</span>
                    {activePlaybooks.length > 0 ? activePlaybooks.map((pb, i) => (
                        <div key={i} className={`flex items-center gap-1 px-2 py-0.5 rounded border ${
                            pb.role === 'primary' 
                                ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30' 
                                : 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                        }`}>
                            <span className="font-bold">{pb.name}</span>
                            <span className="opacity-70 text-[9px] uppercase">({pb.role})</span>
                        </div>
                    )) : (
                        <span className="text-gray-600 italic">No playbooks active. Ask coordinator to setup.</span>
                    )}
                </div>
            </div>

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
            
            <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-3">
            {messages.length === 0 && (
                <div className="text-center text-gray-600 mt-10">
                    <p className="text-xs">Chat with the Desk Coordinator.</p>
                    <p className="text-[10px] opacity-70 mt-1">
                    Try: "Set up the desk for London Open" or "Assign playbooks"
                    </p>
                </div>
            )}
            
            {messages.map((m) => (
                <div key={m.id} className={`flex flex-col gap-1 ${m.author === 'you' ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-center gap-2">
                    <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${m.author === 'you' ? 'bg-emerald-900/50 text-emerald-400' : 'bg-blue-900/50 text-blue-400'}`}>
                        {m.author === 'you' ? 'You' : 'Coordinator'}
                    </span>
                    <span className="text-[9px] text-gray-600">{new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className={`text-xs p-3 rounded-lg max-w-[90%] leading-relaxed whitespace-pre-wrap border ${m.author === 'you' ? 'bg-[#161a25] border-gray-700 text-gray-300' : 'bg-[#1e222d] border-gray-600 text-white'}`}>
                    {m.text}
                    </div>
                </div>
            ))}
            
            {isSending && (
                <div className="flex items-center gap-2 text-xs text-gray-500 animate-pulse">
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-500"></div>
                    Coordinator is thinking...
                </div>
            )}
            </div>

            <div className="p-4 border-t border-gray-800 bg-[#131722]">
            <div className="flex gap-2">
                <input 
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendToDesk()}
                placeholder="Ping the desk..." 
                className="flex-1 bg-[#0b0e14] border border-gray-700 rounded px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 placeholder-gray-700 text-gray-200"
                disabled={isSending}
                />
                <button 
                onClick={sendToDesk}
                disabled={!chatInput.trim() || isSending}
                className="bg-[#2962ff] hover:bg-[#1e53e5] text-white rounded px-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                </button>
            </div>
            </div>
            
            <DeskPolicyPanel />
        </div>
      </div>
    </div>
  );
};

export default TradingRoomFloorView;


import React, { useState, useEffect, useRef } from 'react';
import { fetchAgentInsights, AgentId } from '../services/agentApi';

interface AutopilotPanelProps {
  chartContext: string;
  brokerSessionId: string | null;
  symbol: string;
}

interface LogEntry {
  id: string;
  timestamp: string;
  agentId: string;
  message: string;
  type: 'thought' | 'action' | 'error' | 'system';
}

type AutopilotMode = 'SCALP' | 'SWING' | 'CUSTOM';

const PRESETS: Record<string, string> = {
  SCALP: "Aggressive Scalping. Look for 1m/5m liquidity sweeps. Quick profits (1:1.5 RR). High frequency.",
  SWING: "Conservative Swing. Only trade with H1/H4 trend structure. Wide stops, targets > 1:3 RR. Low frequency.",
  DEFENSIVE: "Capital Preservation. Only A+ setups with clear invalidation. Reduce size by 50%. No counter-trend."
};

const AutopilotPanel: React.FC<AutopilotPanelProps> = ({ chartContext, brokerSessionId, symbol }) => {
  // Core State
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [mandate, setMandate] = useState<string>(PRESETS.SCALP);
  const [inputCommand, setInputCommand] = useState("");
  
  // Configuration
  const [activeAgents, setActiveAgents] = useState<Record<AgentId, boolean>>({
    trend_master: true,
    pattern_gpt: true,
    quant_bot: true,
    journal_coach: false // Coach usually off for autopilot execution loop
  });

  // Loop State
  const [nextTick, setNextTick] = useState<number>(0);
  const isRunningRef = useRef(false);
  const mandateRef = useRef(mandate);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sync ref
  useEffect(() => {
    mandateRef.current = mandate;
  }, [mandate]);

  // Auto-scroll logs
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const addLog = (agentId: string, message: string, type: 'thought' | 'action' | 'error' | 'system' = 'thought') => {
    setLogs(prev => [...prev, {
      id: Math.random().toString(36).slice(2),
      timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' }),
      agentId,
      message,
      type
    }].slice(-200)); // Keep last 200
  };

  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCommand.trim()) return;

    const cmd = inputCommand.trim();
    
    // Check for "slash commands" logic if we wanted, for now just update mandate
    setMandate(cmd);
    addLog('Operator', `UPDATED ORDERS: "${cmd}"`, 'system');
    setInputCommand("");
  };

  const toggleAgent = (id: AgentId) => {
    setActiveAgents(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const setPreset = (name: string, text: string) => {
    setMandate(text);
    addLog('System', `Mode switched to ${name}`, 'system');
  };

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let countdownId: NodeJS.Timeout;

    const tickRate = 15000; // 15 seconds

    const runLoop = async () => {
      if (!isRunningRef.current) return;

      try {
        const activeIds = Object.entries(activeAgents)
          .filter(([_, active]) => active)
          .map(([id]) => id as AgentId);

        if (activeIds.length === 0) {
           addLog('System', 'No agents active. Pausing loop.', 'error');
           setIsRunning(false);
           isRunningRef.current = false;
           return;
        }

        addLog('System', `Ping... Analyzing ${symbol}...`, 'system');

        // Construct the Dynamic Prompt based on User Mandate
        const currentMandate = mandateRef.current;
        const prompt = `
[AUTOPILOT SYSTEM TICK]
TARGET ASSET: ${symbol}

*** OPERATIONAL MANDATE (STRICT) ***
"${currentMandate}"
************************************

INSTRUCTIONS:
1. TrendMaster: Analyze structure/bias vs the Mandate.
2. PatternGPT: Find entry zones that align with Mandate.
3. QuantBot: EXECUTE ONLY IF:
   - Setup matches the Mandate.
   - Confidence > 80%.
   - Use 'execute_order' tool.
   
If no trade aligns with the Mandate, output: "HOLDing. Waiting for [specific condition]."
        `.trim();

        const insights = await fetchAgentInsights({
          agentIds: activeIds,
          userMessage: prompt,
          chartContext: chartContext,
          accountId: brokerSessionId,
          journalMode: 'live'
        });

        // Process results
        insights.forEach(insight => {
           if (insight.error) {
             addLog(insight.agentName, insight.error, 'error');
           } else {
             if (insight.text) {
               addLog(insight.agentName, insight.text, 'thought');
             }
             if (insight.toolCalls && insight.toolCalls.length > 0) {
               insight.toolCalls.forEach(tc => {
                 if (tc.toolName === 'execute_order') {
                    addLog(insight.agentName, `EXECUTING: ${tc.args.side?.toUpperCase()} ${tc.args.size} ${tc.args.symbol}`, 'action');
                    if (tc.result) {
                        addLog('Broker', `Order Result: ${JSON.stringify(tc.result)}`, 'action');
                    }
                 } else if (tc.toolName === 'append_journal_entry') {
                    addLog(insight.agentName, `Journaling: ${tc.args.title}`, 'action');
                 }
               });
             }
           }
        });

      } catch (e: any) {
        addLog('System', `Loop Critical Failure: ${e.message}`, 'error');
      }

      // Schedule next
      if (isRunningRef.current) {
        setNextTick(Date.now() + tickRate);
        timeoutId = setTimeout(runLoop, tickRate);
      }
    };

    // Countdown timer for UI
    countdownId = setInterval(() => {
        if (isRunningRef.current && nextTick > Date.now()) {
            // Force re-render for countdown bar if we wanted strict smoothness, 
            // but React state might be jittery. Handled via CSS animation usually better.
        }
    }, 1000);

    if (isRunning) {
      addLog('System', 'Autopilot Sequence Initiated.', 'system');
      addLog('System', `Mandate: "${mandate}"`, 'system');
      isRunningRef.current = true;
      setNextTick(Date.now() + tickRate);
      runLoop();
    } else {
      isRunningRef.current = false;
      addLog('System', 'Autopilot Disengaged.', 'system');
    }

    return () => {
      clearTimeout(timeoutId);
      clearInterval(countdownId);
    };
  }, [isRunning, chartContext, brokerSessionId, symbol, activeAgents]);

  // Clean toggle
  const toggleRunning = () => {
    setIsRunning(!isRunning);
  };

  return (
    <div className="flex flex-col h-full bg-[#050505] text-gray-300 font-mono text-xs overflow-hidden">
      
      {/* 1. TOP STATUS BAR */}
      <div className="h-12 border-b border-[#2a2e39] bg-[#131722] flex items-center justify-between px-4 shrink-0">
         <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-3 py-1 rounded border ${isRunning ? 'bg-green-500/10 border-green-500/50 text-green-400' : 'bg-red-500/10 border-red-500/50 text-red-400'}`}>
                <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                <span className="font-bold tracking-wider">{isRunning ? 'SYSTEM ACTIVE' : 'SYSTEM OFFLINE'}</span>
            </div>
            <div className="hidden md:flex items-center gap-2 text-gray-500">
               <span className="text-[10px] uppercase">Asset:</span>
               <span className="text-gray-300 font-bold">{symbol}</span>
            </div>
         </div>
         
         <div className="flex items-center gap-2">
            {!brokerSessionId && (
               <span className="text-[9px] text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded border border-yellow-500/20">
                 SIMULATION MODE
               </span>
            )}
            <button
              onClick={() => setLogs([])}
              className="p-1.5 text-gray-500 hover:text-white transition-colors"
              title="Clear Terminal"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            </button>
         </div>
      </div>

      <div className="flex-1 flex min-h-0">
        
        {/* 2. LEFT: TERMINAL LOGS */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0a0c10] relative">
           {/* Scanline effect overlay */}
           <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.03),rgba(0,255,0,0.01),rgba(0,0,255,0.03))] z-0 bg-[length:100%_4px,6px_100%]"></div>
           
           <div className="flex-1 overflow-y-auto p-4 space-y-3 z-10 scrollbar-thin">
              {logs.length === 0 && (
                 <div className="h-full flex flex-col items-center justify-center text-gray-600 opacity-50 space-y-2">
                    <svg className="w-12 h-12 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    <p>Awaiting Command...</p>
                 </div>
              )}
              
              {logs.map((log) => (
                <div key={log.id} className="flex gap-3 animate-fade-in group hover:bg-[#131722] p-1 -mx-1 rounded transition-colors">
                   <div className="w-16 shrink-0 text-[9px] text-gray-600 font-mono pt-1">{log.timestamp}</div>
                   <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                         <span className={`text-[10px] font-bold uppercase tracking-wider ${
                            log.agentId === 'System' || log.agentId === 'Operator' ? 'text-gray-400' :
                            log.agentId === 'QuantBot' ? 'text-blue-400' :
                            log.agentId === 'TrendMaster AI' ? 'text-purple-400' :
                            log.agentId === 'Broker' ? 'text-yellow-400' :
                            'text-emerald-400'
                         }`}>
                           {log.agentId}
                         </span>
                         {log.type === 'action' && <span className="bg-green-500 text-black text-[9px] font-bold px-1 rounded-sm">EXEC</span>}
                         {log.type === 'error' && <span className="bg-red-500 text-white text-[9px] font-bold px-1 rounded-sm">ERR</span>}
                         {log.type === 'system' && <span className="text-gray-500 text-[9px]">INFO</span>}
                      </div>
                      <div className={`mt-0.5 leading-relaxed break-words text-[11px] ${
                        log.type === 'action' ? 'text-green-300' : 
                        log.type === 'error' ? 'text-red-300' :
                        log.type === 'system' ? 'text-gray-500 italic' :
                        'text-gray-300'
                      }`}>
                        {log.message}
                      </div>
                   </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
           </div>

           {/* Input Command Line */}
           <div className="p-2 border-t border-[#2a2e39] bg-[#0d1117] z-20">
              <form onSubmit={handleCommandSubmit} className="flex gap-2 items-center bg-[#1c2128] border border-[#30363d] rounded p-1 pl-3 focus-within:border-[#2962ff] transition-colors">
                  <span className="text-green-500 font-bold">{`>`}</span>
                  <input 
                    type="text" 
                    value={inputCommand}
                    onChange={(e) => setInputCommand(e.target.value)}
                    placeholder="Enter command or update mandate..."
                    className="flex-1 bg-transparent border-none focus:ring-0 text-gray-200 placeholder-gray-600 h-8 text-xs font-mono"
                  />
                  <button 
                    type="submit"
                    className="bg-[#2962ff] hover:bg-[#1e53e5] text-white px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wide transition-colors"
                  >
                    Send
                  </button>
              </form>
           </div>
        </div>

        {/* 3. RIGHT: CONTROL DECK */}
        <div className="w-72 bg-[#131722] border-l border-[#2a2e39] flex flex-col shrink-0 overflow-y-auto">
           
           {/* Mandate Display */}
           <div className="p-4 border-b border-[#2a2e39]">
              <div className="text-[9px] text-gray-500 uppercase font-bold tracking-widest mb-2">Current Orders</div>
              <div className="bg-[#0a0c10] border border-[#2a2e39] p-3 rounded text-green-400 font-mono text-[10px] leading-relaxed shadow-inner">
                 {mandate}
              </div>
           </div>

           {/* Quick Actions */}
           <div className="p-4 border-b border-[#2a2e39]">
              <div className="text-[9px] text-gray-500 uppercase font-bold tracking-widest mb-3">Strategy Presets</div>
              <div className="grid grid-cols-1 gap-2">
                 <button 
                   onClick={() => setPreset('SCALP', PRESETS.SCALP)}
                   className="text-left px-3 py-2 bg-[#1e222d] hover:bg-[#2a2e39] border border-[#2a2e39] rounded transition-all group"
                 >
                    <div className="text-blue-400 font-bold text-[10px] group-hover:text-blue-300">Scalp Mode</div>
                    <div className="text-[9px] text-gray-500 truncate">Aggressive, 1m/5m sweeps</div>
                 </button>
                 <button 
                   onClick={() => setPreset('SWING', PRESETS.SWING)}
                   className="text-left px-3 py-2 bg-[#1e222d] hover:bg-[#2a2e39] border border-[#2a2e39] rounded transition-all group"
                 >
                    <div className="text-purple-400 font-bold text-[10px] group-hover:text-purple-300">Swing Mode</div>
                    <div className="text-[9px] text-gray-500 truncate">H1/H4 structure only</div>
                 </button>
                 <button 
                   onClick={() => setPreset('DEFENSIVE', PRESETS.DEFENSIVE)}
                   className="text-left px-3 py-2 bg-[#1e222d] hover:bg-[#2a2e39] border border-[#2a2e39] rounded transition-all group"
                 >
                    <div className="text-orange-400 font-bold text-[10px] group-hover:text-orange-300">Defensive</div>
                    <div className="text-[9px] text-gray-500 truncate">Half size, A+ only</div>
                 </button>
              </div>
           </div>

           {/* Squad Configuration */}
           <div className="p-4 border-b border-[#2a2e39] flex-1">
              <div className="text-[9px] text-gray-500 uppercase font-bold tracking-widest mb-3">Active Agents</div>
              <div className="space-y-2">
                 {Object.entries(activeAgents).map(([id, active]) => (
                    <div key={id} className="flex items-center justify-between bg-[#1e222d] p-2 rounded border border-[#2a2e39]">
                       <div className="flex items-center gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-green-500' : 'bg-gray-600'}`}></div>
                          <span className={`text-[10px] font-bold uppercase ${active ? 'text-gray-200' : 'text-gray-500'}`}>
                             {id.replace('_', ' ')}
                          </span>
                       </div>
                       <button 
                         onClick={() => toggleAgent(id as AgentId)}
                         className={`text-[9px] px-2 py-0.5 rounded border transition-colors ${
                            active 
                              ? 'bg-blue-500/10 text-blue-400 border-blue-500/30 hover:bg-blue-500/20' 
                              : 'bg-gray-700/30 text-gray-500 border-gray-600 hover:text-gray-300'
                         }`}
                       >
                         {active ? 'ON' : 'OFF'}
                       </button>
                    </div>
                 ))}
              </div>
              
              <div className="mt-6 bg-red-900/10 border border-red-500/20 p-3 rounded">
                  <h4 className="text-red-400 font-bold text-[10px] mb-1">⚠️ RISK OVERRIDE</h4>
                  <p className="text-[9px] text-gray-500 leading-relaxed">
                    QuantBot is authorized to execute trades if confidence {'>'} 80%. 
                    Monitor logs closely.
                  </p>
              </div>
           </div>

           {/* Main Switch */}
           <div className="p-4 bg-[#0a0c10] border-t border-[#2a2e39]">
              <button
                onClick={toggleRunning}
                className={`w-full py-3 rounded font-bold tracking-wider text-xs transition-all shadow-lg ${
                  isRunning 
                    ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/20' 
                    : 'bg-green-600 hover:bg-green-500 text-white shadow-green-600/20'
                }`}
              >
                {isRunning ? 'TERMINATE LOOP' : 'INITIATE AUTOPILOT'}
              </button>
           </div>

        </div>
      </div>
    </div>
  );
};

export default AutopilotPanel;

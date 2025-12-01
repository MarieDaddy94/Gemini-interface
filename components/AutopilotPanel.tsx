
import React, { useState, useEffect, useRef } from 'react';
import { fetchAgentInsights, AgentInsight, AgentId } from '../services/agentApi';

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
  type: 'thought' | 'action' | 'error';
}

const AutopilotPanel: React.FC<AutopilotPanelProps> = ({ chartContext, brokerSessionId, symbol }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  
  // Using ref to access current state inside interval closure
  const isRunningRef = useRef(false);
  
  const toggleAutopilot = () => {
    const nextState = !isRunning;
    setIsRunning(nextState);
    isRunningRef.current = nextState;
  };

  const addLog = (agentId: string, message: string, type: 'thought' | 'action' | 'error' = 'thought') => {
    setLogs(prev => [{
      id: Math.random().toString(36).slice(2),
      timestamp: new Date().toLocaleTimeString(),
      agentId,
      message,
      type
    }, ...prev].slice(0, 50)); // Keep last 50 logs
  };

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const runLoop = async () => {
      if (!isRunningRef.current) return;

      try {
        setLastUpdate(new Date());
        
        // 1. Send tick to squad
        // Sequence: TrendMaster (Context) -> PatternGPT (Levels) -> QuantBot (Execution)
        const agentIds: AgentId[] = ['trend_master', 'pattern_gpt', 'quant_bot'];
        
        const prompt = `
AUTOPILOT TICK [${new Date().toLocaleTimeString()}]:
Analyze the current ${symbol} market.
1. TrendMaster: Define bias.
2. PatternGPT: Identify key levels.
3. QuantBot: EXECUTE TRADE if setups A+ quality (>80% confidence). Use 'execute_order' tool.
If no trade, explicitly state "HOLD".
        `.trim();

        const insights = await fetchAgentInsights({
          agentIds,
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
             // Log the thought process
             if (insight.text) {
               addLog(insight.agentName, insight.text, 'thought');
             }
             
             // Log actions (tool calls)
             if (insight.toolCalls && insight.toolCalls.length > 0) {
               insight.toolCalls.forEach(tc => {
                 if (tc.toolName === 'execute_order') {
                    addLog(insight.agentName, `EXECUTING: ${tc.args.side} ${tc.args.size} ${tc.args.symbol}`, 'action');
                    addLog('System', `Order Result: ${tc.result}`, 'action');
                 }
               });
             }
           }
        });

      } catch (e: any) {
        addLog('System', `Loop Error: ${e.message}`, 'error');
        // If critical error, maybe stop? For now, just log.
      }

      // Schedule next tick (e.g. every 15 seconds)
      if (isRunningRef.current) {
        timeoutId = setTimeout(runLoop, 15000);
      }
    };

    if (isRunning) {
      addLog('System', 'Autopilot Engaged. Initializing loop...', 'action');
      runLoop();
    } else {
      if (lastUpdate) {
        addLog('System', 'Autopilot Disengaged.', 'action');
      }
    }

    return () => clearTimeout(timeoutId);
  }, [isRunning, chartContext, brokerSessionId, symbol]); // Dependencies that restart the effect if changed

  return (
    <div className="flex flex-col h-full bg-[#0a0c10] text-gray-300 font-mono text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2e39] bg-[#131722]">
        <div className="flex items-center gap-3">
           <div className={`w-3 h-3 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
           <h2 className="text-sm font-bold text-white tracking-wider uppercase">Autopilot Control</h2>
           <span className="bg-[#1e222d] px-2 py-0.5 rounded text-[10px] text-gray-400 border border-[#2a2e39]">
             {symbol}
           </span>
        </div>
        <button
          onClick={toggleAutopilot}
          className={`px-4 py-1.5 rounded font-bold transition-all border ${
            isRunning 
              ? 'bg-red-500/10 text-red-500 border-red-500/50 hover:bg-red-500/20' 
              : 'bg-green-500/10 text-green-500 border-green-500/50 hover:bg-green-500/20'
          }`}
        >
          {isRunning ? 'DISENGAGE' : 'ENGAGE AUTOPILOT'}
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Log Stream */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-[#2a2e39]">
           <div className="px-4 py-2 bg-[#1e222d] border-b border-[#2a2e39] text-[10px] text-gray-500 flex justify-between">
              <span>SYSTEM LOGS</span>
              <span>Last Update: {lastUpdate ? lastUpdate.toLocaleTimeString() : '--:--:--'}</span>
           </div>
           <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono">
              {logs.length === 0 && (
                <div className="text-gray-600 text-center mt-10 italic">
                  System ready. Engage autopilot to begin agent loop.
                </div>
              )}
              {logs.map((log) => (
                <div key={log.id} className="flex gap-3 animate-fade-in">
                   <div className="w-16 shrink-0 text-[10px] text-gray-500">{log.timestamp}</div>
                   <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                         <span className={`text-[10px] font-bold uppercase tracking-wide ${
                            log.agentId === 'System' ? 'text-gray-400' :
                            log.agentId === 'QuantBot' ? 'text-blue-400' :
                            log.agentId === 'TrendMaster AI' ? 'text-purple-400' :
                            'text-green-400'
                         }`}>
                           {log.agentId}
                         </span>
                         {log.type === 'action' && <span className="bg-green-900/30 text-green-500 text-[9px] px-1 rounded border border-green-900/50">ACTION</span>}
                         {log.type === 'error' && <span className="bg-red-900/30 text-red-500 text-[9px] px-1 rounded border border-red-900/50">ERROR</span>}
                      </div>
                      <div className={`leading-relaxed whitespace-pre-wrap ${
                        log.type === 'action' ? 'text-white bg-white/5 p-2 rounded border-l-2 border-green-500' : 
                        log.type === 'error' ? 'text-red-300 bg-red-900/10 p-2 rounded border-l-2 border-red-500' :
                        'text-gray-300'
                      }`}>
                        {log.message}
                      </div>
                   </div>
                </div>
              ))}
           </div>
        </div>
        
        {/* Status / Config Sidebar */}
        <div className="w-64 bg-[#131722] flex flex-col shrink-0">
           <div className="p-4 border-b border-[#2a2e39]">
              <h3 className="text-white font-semibold mb-3 text-xs uppercase tracking-wide">Status</h3>
              <div className="space-y-3">
                 <div className="bg-[#1e222d] p-2 rounded border border-[#2a2e39]">
                    <div className="text-[10px] text-gray-400 uppercase">Connection</div>
                    <div className={`font-mono text-sm ${brokerSessionId ? 'text-green-400' : 'text-red-400'}`}>
                      {brokerSessionId ? 'ONLINE' : 'OFFLINE'}
                    </div>
                 </div>
                 <div className="bg-[#1e222d] p-2 rounded border border-[#2a2e39]">
                    <div className="text-[10px] text-gray-400 uppercase">Loop Interval</div>
                    <div className="font-mono text-sm text-blue-400">15 Seconds</div>
                 </div>
              </div>
           </div>
           
           <div className="p-4 border-b border-[#2a2e39]">
              <h3 className="text-white font-semibold mb-3 text-xs uppercase tracking-wide">Squad</h3>
              <div className="space-y-2">
                 {['TrendMaster', 'PatternGPT', 'QuantBot'].map(agent => (
                   <div key={agent} className="flex items-center gap-2 text-[11px] text-gray-400">
                      <div className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-green-500' : 'bg-gray-600'}`}></div>
                      <span>{agent}</span>
                      {agent === 'QuantBot' && <span className="ml-auto text-[9px] border border-red-500/30 text-red-400 px-1 rounded">EXEC</span>}
                   </div>
                 ))}
              </div>
           </div>

           <div className="p-4">
              <div className="bg-blue-900/20 border border-blue-500/20 p-3 rounded text-[10px] text-blue-200 leading-relaxed">
                 <span className="font-bold block mb-1">ℹ️ SAFETY MODE</span>
                 Autopilot is running in simulation mode unless a real broker is connected. QuantBot requires >80% confidence to execute.
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default AutopilotPanel;

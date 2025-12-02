
import React, { useMemo, useState, useEffect } from 'react';
import {
  AutopilotMode,
  AutopilotCommand,
  AutopilotExecuteResponse,
  OpenTradeCommand,
  RiskVerdict,
} from '../types';
import { useAutopilotExecute, useBrokerSnapshot } from '../hooks/useAutopilot';
import RealtimeSquadPanel from './RealtimeSquadPanel';
import RealtimeControlBar from './RealtimeControlBar';
import { useAutopilotContext } from '../context/AutopilotContext';

type PanelTab = 'compose' | 'status' | 'voice-squad';

const AutopilotPanel: React.FC = () => {
  const { activeProposal, proposalSource, riskVerdict: ctxRiskVerdict, riskComment: ctxRiskComment } = useAutopilotContext();
  
  const [mode, setMode] = useState<AutopilotMode>('confirm');
  const [activeTab, setActiveTab] = useState<PanelTab>('compose');

  // Load OpenAI Realtime URL
  const apiBase = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000';
  const defaultWsUrl = apiBase.replace(/^http/, 'ws') + '/ws/openai-realtime';
  const openaiWsUrl = (import.meta as any).env?.VITE_OPENAI_REALTIME_URL || defaultWsUrl;

  const [manualCommand, setManualCommand] = useState<AutopilotCommand | null>(() => ({
      type: 'open',
      tradableInstrumentId: 0,
      symbol: 'US30',
      side: 'BUY',
      qty: 1.0,
      entryType: 'market'
  } as OpenTradeCommand));

  const { snapshot, loading: snapshotLoading, error: snapshotError } = useBrokerSnapshot(10_000);
  const { execute, state } = useAutopilotExecute();

  // Use source from context if active, else default to manual
  const [pendingCommandSource, setPendingCommandSource] = useState<'manual' | 'agent' | 'desk'>('manual');

  useEffect(() => {
     if (activeProposal) {
        setPendingCommandSource(proposalSource as any);
     }
  }, [activeProposal, proposalSource]);

  const pendingCommand: AutopilotCommand | null = useMemo(() => {
    if (pendingCommandSource !== 'manual' && activeProposal) {
      return activeProposal;
    }
    return manualCommand;
  }, [pendingCommandSource, manualCommand, activeProposal]);

  const riskVerdict = ctxRiskVerdict ?? 'UNKNOWN';
  const riskComment = ctxRiskComment;

  let riskVerdictColor = '#9e9e9e';
  if (riskVerdict === 'ALLOW') riskVerdictColor = '#4caf50';
  else if (riskVerdict === 'BLOCK') riskVerdictColor = '#f44336';

  const handleExecute = async () => {
    if (!pendingCommand) return;
    await execute(mode, pendingCommand, pendingCommandSource);
    setActiveTab('status');
  };

  const last = state.lastResponse;

  return (
    <div className="flex flex-col gap-4 h-full bg-[#050509] text-gray-300 font-sans text-xs border-l border-gray-800">
      <div className="flex-none"><RealtimeControlBar /></div>

      <div className="flex justify-between items-center gap-4 px-4 py-3 border-b border-gray-800 bg-[#131722] shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-gray-100 m-0">Autopilot Control</h2>
          <div className="text-[10px] text-gray-500 mt-0.5">Manage execution logic.</div>
        </div>
        <div className="flex items-center gap-1 bg-black/40 p-1 rounded-full border border-gray-700">
            <button onClick={() => setMode('confirm')} className={`px-3 py-1 rounded-full text-[10px] ${mode === 'confirm' ? 'bg-[#2a2e39] text-white' : 'text-gray-500'}`}>Confirm</button>
            <button onClick={() => setMode('auto')} className={`px-3 py-1 rounded-full text-[10px] ${mode === 'auto' ? 'bg-red-900/30 text-red-200' : 'text-gray-500'}`}>Auto</button>
        </div>
      </div>

      {/* Snapshot Summary */}
      <div className="px-4">
        <div className="flex gap-4 p-3 rounded-lg border border-[#2a2e39] bg-[#1e222d] shadow-sm text-xs">
           <div className="flex-1">
              <div className="text-[10px] text-gray-500 uppercase">Account</div>
              {snapshot ? (
                 <div className="font-mono text-white">
                    Eq: {snapshot.equity.toFixed(2)} | Bal: {snapshot.balance.toFixed(2)}
                 </div>
              ) : (
                 <div className="text-gray-500 italic">Loading...</div>
              )}
           </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-gray-800 px-4 mt-2">
        <button onClick={() => setActiveTab('compose')} className={`pb-2 text-[11px] font-medium border-b-2 ${activeTab === 'compose' ? 'border-[#2962ff] text-[#2962ff]' : 'border-transparent text-gray-500'}`}>Compose</button>
        <button onClick={() => setActiveTab('status')} className={`pb-2 text-[11px] font-medium border-b-2 ${activeTab === 'status' ? 'border-[#2962ff] text-[#2962ff]' : 'border-transparent text-gray-500'}`}>Last Decision</button>
        <button onClick={() => setActiveTab('voice-squad')} className={`pb-2 text-[11px] font-medium border-b-2 ${activeTab === 'voice-squad' ? 'border-[#2962ff] text-[#2962ff]' : 'border-transparent text-gray-500'}`}>Voice Squad</button>
      </div>

      <div className="flex-1 flex flex-col gap-4 overflow-auto px-4 pb-4">
        {activeTab === 'voice-squad' && <RealtimeSquadPanel openaiRealtimeWsUrl={openaiWsUrl} />}

        {activeTab === 'compose' && (
          <div className="flex flex-col md:flex-row gap-4 h-full">
            <div className="flex-1 p-3 rounded-lg border border-[#2a2e39] bg-[#161a25]">
               <div className="flex justify-between items-center mb-3">
                  <div className="font-semibold text-gray-200">Execution Plan</div>
                  <select 
                    value={pendingCommandSource} 
                    onChange={(e) => setPendingCommandSource(e.target.value as any)}
                    className="bg-[#101018] border border-gray-700 text-gray-300 text-[10px] rounded px-2 py-1"
                  >
                    <option value="manual">Manual</option>
                    <option value="desk" disabled={!activeProposal || proposalSource !== 'desk'}>From Desk</option>
                    <option value="agent" disabled={!activeProposal || proposalSource !== 'agent'}>From Agent</option>
                  </select>
               </div>

               {pendingCommand && (
                 <div className="bg-black/40 rounded p-3 font-mono text-[10px] text-green-400 whitespace-pre-wrap mb-3 border border-gray-800">
                    {JSON.stringify(pendingCommand, null, 2)}
                 </div>
               )}

               {riskComment && (
                 <div className="mb-3 p-2 bg-black/20 border border-gray-800 rounded">
                    <div className="flex items-center gap-2 mb-1">
                       <span className="text-[10px] text-gray-500 uppercase">Risk Verdict</span>
                       <span style={{ color: riskVerdictColor }} className="font-bold text-[10px]">{riskVerdict}</span>
                    </div>
                    <p className="text-[10px] text-gray-400">{riskComment}</p>
                 </div>
               )}

               <div className="flex justify-end pt-2 border-t border-gray-700">
                  <button 
                    onClick={handleExecute}
                    disabled={!pendingCommand || state.executing}
                    className="px-4 py-2 bg-[#2962ff] hover:bg-[#1e53e5] text-white rounded text-xs font-bold uppercase disabled:opacity-50"
                  >
                    {state.executing ? 'Executing...' : 'Execute'}
                  </button>
               </div>
            </div>
          </div>
        )}

        {activeTab === 'status' && last && (
           <div className="p-4 rounded-lg border border-[#2a2e39] bg-[#161a25]">
              <div className="font-semibold text-gray-200 mb-2">Last Execution Result</div>
              <div className="space-y-1 text-xs">
                 <div>Executed: <span className={last.result.executed ? 'text-green-400' : 'text-red-400'}>{last.result.executed ? 'YES' : 'NO'}</span></div>
                 <div>Allowed by Guard: {last.result.allowedByGuard ? 'YES' : 'NO'}</div>
                 {last.result.reasons.length > 0 && (
                    <div className="text-red-400 mt-2">
                       Blocks: {last.result.reasons.join(', ')}
                    </div>
                 )}
              </div>
           </div>
        )}
      </div>
    </div>
  );
};

export default AutopilotPanel;

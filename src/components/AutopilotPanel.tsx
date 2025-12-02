
import React, { useMemo, useState } from 'react';
import {
  AutopilotMode,
  AutopilotCommand,
  AutopilotExecuteResponse,
  BrokerSnapshot,
  OpenTradeCommand,
  RiskVerdict,
} from '../types';
import { useAutopilotExecute, useBrokerSnapshot } from '../hooks/useAutopilot';
import RealtimeSquadPanel from './RealtimeSquadPanel';
import RealtimeControlBar from './RealtimeControlBar';
import { useVoiceActivity } from '../context/VoiceActivityContext';

type PanelTab = 'compose' | 'status' | 'voice-squad';

interface AutopilotPanelProps {
  // Proposed command from the AI round-table (Execution Bot)
  agentProposedCommand?: AutopilotCommand | null;
  // Risk Manager verdict on that command
  agentRiskVerdict?: RiskVerdict | null;
  // Full Risk Manager comment on that command
  agentRiskComment?: string | null;
}

const AutopilotPanel: React.FC<AutopilotPanelProps> = ({
  agentProposedCommand,
  agentRiskVerdict,
  agentRiskComment,
}) => {
  const [mode, setMode] = useState<AutopilotMode>('confirm');
  const [activeTab, setActiveTab] = useState<PanelTab>('compose');
  const { activeSpeaker } = useVoiceActivity();

  // Load OpenAI Realtime URL from environment or default to local proxy
  const apiBase = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000';
  const defaultWsUrl = apiBase.replace(/^http/, 'ws') + '/ws/openai-realtime';
  const openaiWsUrl = (import.meta as any).env?.VITE_OPENAI_REALTIME_URL || defaultWsUrl;

  const [manualCommand, setManualCommand] = useState<AutopilotCommand | null>(() => {
    const defaultOpen: OpenTradeCommand = {
      type: 'open',
      tradableInstrumentId: 0,
      symbol: 'US30',
      side: 'BUY',
      qty: 1.0,
      entryType: 'market',
      price: undefined,
      stopPrice: undefined,
      slPrice: undefined,
      tpPrice: undefined,
      routeId: undefined,
      clientOrderId: undefined,
    };
    return defaultOpen;
  });

  const { snapshot, loading: snapshotLoading, error: snapshotError } =
    useBrokerSnapshot(10_000);
  const { execute, state } = useAutopilotExecute();

  const [pendingCommandSource, setPendingCommandSource] =
    useState<'manual' | 'agent'>('manual');

  const [requireRiskAllowForAuto, setRequireRiskAllowForAuto] =
    useState<boolean>(true);
  const [riskGateMessage, setRiskGateMessage] = useState<string | null>(
    null,
  );

  const pendingCommand: AutopilotCommand | null = useMemo(() => {
    if (pendingCommandSource === 'agent' && agentProposedCommand) {
      return agentProposedCommand;
    }
    return manualCommand;
  }, [pendingCommandSource, manualCommand, agentProposedCommand]);

  const handleModeChange = (newMode: AutopilotMode) => {
    setMode(newMode);
  };

  const handleManualNumberChange = (
    field: keyof OpenTradeCommand,
    value: string,
  ) => {
    if (!manualCommand || manualCommand.type !== 'open') return;
    const n = value === '' ? NaN : Number(value);
    const updated: OpenTradeCommand = {
      ...manualCommand,
      [field]: Number.isFinite(n) ? n : undefined,
    };
    setManualCommand(updated);
  };

  const handleManualStringChange = (
    field: keyof OpenTradeCommand,
    value: string,
  ) => {
    if (!manualCommand || manualCommand.type !== 'open') return;
    const updated: OpenTradeCommand = {
      ...manualCommand,
      [field]: value,
    };
    setManualCommand(updated);
  };

  const riskVerdict: RiskVerdict = agentRiskVerdict ?? 'UNKNOWN';
  const riskVerdictLabelMap: Record<RiskVerdict, string> = {
    ALLOW: 'ALLOW',
    ALLOW_WITH_CAUTION: 'ALLOW WITH CAUTION',
    BLOCK: 'BLOCK',
    UNKNOWN: 'UNKNOWN',
  };
  let riskVerdictColor = '#9e9e9e';
  if (riskVerdict === 'ALLOW') riskVerdictColor = '#4caf50';
  else if (riskVerdict === 'ALLOW_WITH_CAUTION')
    riskVerdictColor = '#ff9800';
  else if (riskVerdict === 'BLOCK') riskVerdictColor = '#f44336';

  const gateAutoIfRiskBlocks = (modeToUse: AutopilotMode): boolean => {
    const wantsAuto = modeToUse === 'auto';
    if (!wantsAuto || !requireRiskAllowForAuto) {
      setRiskGateMessage(null);
      return true;
    }

    if (riskVerdict === 'ALLOW') {
      setRiskGateMessage(null);
      return true;
    }

    const msg =
      riskVerdict === 'BLOCK'
        ? 'Risk Manager verdict is BLOCK. Autopilot auto-execution is disabled while "Require Risk ALLOW" is on.'
        : 'Risk Manager did not return a clear ALLOW verdict. Switch to Confirm mode, adjust the plan, or disable the Risk gate if you still want to auto-execute.';
    setRiskGateMessage(msg);
    setActiveTab('status');
    return false;
  };

  const handleExecute = async () => {
    if (!pendingCommand) return;

    if (!gateAutoIfRiskBlocks(mode)) {
      return;
    }

    await execute(mode, pendingCommand, pendingCommandSource);
    setActiveTab('status');
  };

  const handleApproveFromConfirm = async () => {
    if (!pendingCommand) return;

    const autoMode: AutopilotMode = 'auto';
    if (!gateAutoIfRiskBlocks(autoMode)) {
      return;
    }

    await execute(
      'auto',
      pendingCommand,
      `${pendingCommandSource}-approved`,
    );
    setActiveTab('status');
  };

  const last: AutopilotExecuteResponse | null = state.lastResponse;

  return (
    <div className="flex flex-col gap-4 h-full bg-[#050509] text-gray-300 font-sans text-xs border-l border-gray-800">
      {/* Realtime Controls */}
      <div className="flex-none">
         <RealtimeControlBar />
      </div>

      {/* Header */}
      <div className="flex justify-between items-center gap-4 px-4 py-3 border-b border-gray-800 bg-[#131722] shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-gray-100 m-0">Autopilot Control</h2>
          <div className="flex items-center gap-2 mt-0.5">
             <p className="text-[10px] text-gray-500 m-0">
               Manage execution logic: discuss, confirm, or auto-fire.
             </p>
          </div>
        </div>

        {/* Mode + Risk gate */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 text-[11px] opacity-80 cursor-pointer">
            <input
              type="checkbox"
              checked={requireRiskAllowForAuto}
              onChange={(e) =>
                setRequireRiskAllowForAuto(e.target.checked)
              }
              className="accent-[#2962ff]"
            />
            Require Risk &quot;ALLOW&quot; for auto
          </label>

          <div className="flex items-center gap-1 p-1 rounded-full bg-black/40 border border-gray-700">
            <button
              onClick={() => handleModeChange('confirm')}
              className={`px-3 py-1 rounded-full text-[10px] font-medium transition-colors ${
                mode === 'confirm' ? 'bg-[#2a2e39] text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Confirm
            </button>
            <button
              onClick={() => handleModeChange('auto')}
              className={`px-3 py-1 rounded-full text-[10px] font-medium transition-colors ${
                mode === 'auto' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Auto
            </button>
          </div>
        </div>
      </div>

      {/* Top row: Account snapshot summary */}
      <div className="px-4">
        <div className="flex gap-4 p-3 rounded-lg border border-[#2a2e39] bg-[#1e222d] shadow-sm text-xs">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Account</div>
            {snapshotLoading && <div className="text-gray-500 italic">Loading snapshot...</div>}
            {snapshotError && <div className="text-red-400">Error: {snapshotError}</div>}
            {snapshot && (
              <div className="space-y-0.5">
                <div className="font-bold text-white text-xs">
                  {snapshot.broker} #{snapshot.accountId} <span className="text-gray-500 font-normal">({snapshot.currency})</span>
                </div>
                <div>
                  Bal: <span className="text-gray-300">{snapshot.balance.toFixed(2)}</span> · Eq:{' '}
                  <span className="text-white font-semibold">{snapshot.equity.toFixed(2)}</span>
                </div>
                <div className="flex gap-2">
                  <span>
                    Day: <span className={snapshot.dailyPnl >= 0 ? 'text-[#089981]' : 'text-[#f23645]'}>
                      {snapshot.dailyPnl >= 0 ? '+' : ''}{snapshot.dailyPnl.toFixed(2)}
                    </span>
                  </span>
                  <span>
                    Open: <span className={snapshot.netUnrealizedPnl >= 0 ? 'text-[#089981]' : 'text-[#f23645]'}>
                      {snapshot.netUnrealizedPnl >= 0 ? '+' : ''}{snapshot.netUnrealizedPnl.toFixed(2)}
                    </span>
                  </span>
                </div>
                <div className="text-[10px] text-gray-500">
                  Margin: {snapshot.marginUsed.toFixed(2)} used / {snapshot.marginAvailable.toFixed(2)} free
                </div>
              </div>
            )}
          </div>

          <div className="w-px bg-gray-700 mx-2" />

          {/* open positions count */}
          <div className="min-w-[100px] flex flex-col justify-center">
            <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Active Positions</div>
            {snapshot && snapshot.openPositions.length > 0 ? (
              <>
                <div className="text-3xl font-bold text-white leading-none">
                  {snapshot.openPositions.length}
                </div>
                <div className="text-[10px] text-gray-500 mt-1">
                  Risk: {snapshot.openRisk.toFixed(2)}
                </div>
              </>
            ) : (
              <div className="text-gray-500 italic text-[11px]">None</div>
            )}
          </div>
        </div>
      </div>

      {/* Tab selector */}
      <div className="flex gap-4 border-b border-gray-800 px-4 mt-2">
        <button
          onClick={() => setActiveTab('compose')}
          className={`pb-2 text-[11px] font-medium transition-colors border-b-2 ${
            activeTab === 'compose' ? 'border-[#2962ff] text-[#2962ff]' : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          Compose Trade
        </button>
        <button
          onClick={() => setActiveTab('status')}
          className={`pb-2 text-[11px] font-medium transition-colors border-b-2 ${
            activeTab === 'status' ? 'border-[#2962ff] text-[#2962ff]' : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          Last Decision
        </button>
        <button
          onClick={() => setActiveTab('voice-squad')}
          className={`pb-2 text-[11px] font-medium transition-colors border-b-2 ${
            activeTab === 'voice-squad' ? 'border-[#2962ff] text-[#2962ff]' : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          Voice Squad
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col gap-4 overflow-auto px-4 pb-4">
        {activeTab === 'voice-squad' && (
           <RealtimeSquadPanel openaiRealtimeWsUrl={openaiWsUrl} />
        )}

        {activeTab === 'compose' && (
          <div className="flex flex-col md:flex-row gap-4 h-full">
            {/* Left: manual composer */}
            <div className="flex-1 p-3 rounded-lg border border-[#2a2e39] bg-[#161a25]">
              <div className="flex justify-between items-center mb-3">
                <div>
                  <div className="font-semibold text-gray-200">Manual Trade Template</div>
                  <div className="text-[10px] text-gray-500">
                    Define the order parameters for the Execution Guard.
                  </div>
                </div>
                <select
                  value={pendingCommandSource}
                  onChange={(e) => setPendingCommandSource(e.target.value as any)}
                  className="bg-[#101018] border border-gray-700 text-gray-300 text-[10px] rounded px-2 py-1 focus:outline-none focus:border-[#2962ff]"
                >
                  <option value="manual">Manual Entry</option>
                  <option value="agent" disabled={!agentProposedCommand}>
                    Agent Proposal
                  </option>
                </select>
              </div>

              {manualCommand?.type === 'open' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-1">Symbol</label>
                    <input
                      value={manualCommand.symbol ?? ''}
                      onChange={(e) =>
                        handleManualStringChange('symbol', e.target.value.toUpperCase())
                      }
                      className="w-full bg-[#101018] border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#2962ff]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-gray-500 block mb-1">Instrument ID</label>
                    <input
                      type="number"
                      value={manualCommand.tradableInstrumentId || ''}
                      onChange={(e) =>
                        handleManualNumberChange('tradableInstrumentId', e.target.value)
                      }
                      className="w-full bg-[#101018] border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#2962ff]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-gray-500 block mb-1">Side</label>
                    <select
                      value={manualCommand.side}
                      onChange={(e) =>
                        handleManualStringChange('side', e.target.value as any)
                      }
                      className="w-full bg-[#101018] border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#2962ff]"
                    >
                      <option value="BUY">BUY</option>
                      <option value="SELL">SELL</option>
                      <option value="BOTH">BOTH (Buy + Sell)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] text-gray-500 block mb-1">Qty (lots)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={manualCommand.qty || ''}
                      onChange={(e) => handleManualNumberChange('qty', e.target.value)}
                      className="w-full bg-[#101018] border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#2962ff]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-gray-500 block mb-1">Entry Type</label>
                    <select
                      value={manualCommand.entryType}
                      onChange={(e) =>
                        handleManualStringChange('entryType', e.target.value as any)
                      }
                      className="w-full bg-[#101018] border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#2962ff]"
                    >
                      <option value="market">Market</option>
                      <option value="limit">Limit</option>
                      <option value="stop">Stop</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] text-gray-500 block mb-1">Entry Price (Optional)</label>
                    <input
                      type="number"
                      value={manualCommand.price ?? ''}
                      onChange={(e) => handleManualNumberChange('price', e.target.value)}
                      className="w-full bg-[#101018] border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#2962ff]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-gray-500 block mb-1">Stop Loss</label>
                    <input
                      type="number"
                      value={manualCommand.slPrice ?? ''}
                      onChange={(e) => handleManualNumberChange('slPrice', e.target.value)}
                      className="w-full bg-[#101018] border border-red-900/50 rounded px-2 py-1.5 text-xs text-red-200 focus:outline-none focus:border-red-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-gray-500 block mb-1">Take Profit</label>
                    <input
                      type="number"
                      value={manualCommand.tpPrice ?? ''}
                      onChange={(e) => handleManualNumberChange('tpPrice', e.target.value)}
                      className="w-full bg-[#101018] border border-green-900/50 rounded px-2 py-1.5 text-xs text-green-200 focus:outline-none focus:border-green-500"
                    />
                  </div>
                </div>
              ) : (
                <div className="text-gray-500 italic p-4 text-center">Form logic for this command type not implemented.</div>
              )}

              <div className="mt-4 flex justify-end gap-2 border-t border-gray-700 pt-3">
                <button
                  disabled={!pendingCommand || state.executing}
                  onClick={handleExecute}
                  className={`px-4 py-2 rounded text-xs font-bold uppercase tracking-wide transition-colors ${
                     state.executing 
                        ? 'bg-gray-700 text-gray-400 cursor-wait'
                        : mode === 'confirm'
                           ? 'bg-[#2962ff] hover:bg-[#1e53e5] text-white shadow-lg shadow-blue-500/20'
                           : 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-500/20'
                  }`}
                >
                  {state.executing ? 'Processing...' : mode === 'confirm' ? 'Submit Proposal' : 'Execute Autopilot'}
                </button>
              </div>
            </div>

            {/* Right: proposed command preview */}
            <div className="w-full md:w-80 p-3 rounded-lg border border-[#2a2e39] bg-[#161a25] flex flex-col">
              <div className="mb-2">
                <div className="font-semibold text-gray-200">Pending Payload</div>
                <div className="text-[10px] text-gray-500">
                  JSON payload to <code>/api/autopilot/execute</code>
                </div>
              </div>
              
              <div className="flex-1 bg-black/40 rounded border border-gray-800 p-2 overflow-auto mb-3 custom-scrollbar">
                {pendingCommand ? (
                  <pre className="text-[10px] text-green-400 font-mono whitespace-pre-wrap break-all">
                    {JSON.stringify(pendingCommand, null, 2)}
                  </pre>
                ) : (
                  <div className="text-gray-600 italic text-[11px] text-center mt-10">No active command.</div>
                )}
              </div>

              {mode === 'confirm' && last && !last.result.executed && last.result.allowedByGuard && (
                <button
                  onClick={handleApproveFromConfirm}
                  className="w-full py-2.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-wide shadow-lg shadow-emerald-500/20 transition-colors"
                >
                  Approve & Execute
                </button>
              )}
            </div>
          </div>
        )}

        {activeTab === 'status' && (
          <div className="p-4 rounded-lg border border-[#2a2e39] bg-[#161a25] flex-1 overflow-auto">
            <div className="flex justify-between items-center mb-4 border-b border-gray-800 pb-3">
              <div>
                <div className="font-semibold text-gray-200 text-sm">Last Decision</div>
                <div className="text-[11px] text-gray-500">
                  Guardrails outcome for the most recent request.
                </div>
              </div>
            </div>

            {riskGateMessage && (
              <div className="mb-4 p-2 rounded bg-red-500/10 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
                 <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                 {riskGateMessage}
              </div>
            )}

            {/* Risk Manager verdict (command-level) */}
            <div className="mb-4 bg-black/20 p-3 rounded border border-gray-800">
              <div className="text-[10px] text-gray-500 uppercase font-bold mb-2">Risk Manager Verdict</div>
              <div className="flex items-center gap-3">
                <span
                  style={{ backgroundColor: riskVerdictColor }}
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold text-black"
                >
                  {riskVerdictLabelMap[riskVerdict]}
                </span>
                {agentRiskComment && (
                  <span className="text-gray-300 text-xs opacity-90 truncate max-w-md">
                    {agentRiskComment.split('\n').find((l) => l.trim().length > 0) ?? agentRiskComment}
                  </span>
                )}
              </div>
              {agentRiskComment && (
                <details className="mt-2 group">
                  <summary className="cursor-pointer text-[10px] text-blue-400 hover:text-blue-300">Show Full Comment</summary>
                  <pre className="mt-2 text-[10px] text-gray-400 font-mono whitespace-pre-wrap bg-black/40 p-2 rounded">
                    {agentRiskComment}
                  </pre>
                </details>
              )}
            </div>

            {!last ? (
              <div className="flex flex-col items-center justify-center h-40 text-gray-500">
                 <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="opacity-50 mb-2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                 <span className="text-[11px]">No recent execution attempts.</span>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-black/20 p-3 rounded border border-gray-800">
                    <div className="text-[10px] text-gray-500 uppercase font-bold mb-2">Execution Status</div>
                    <div className="space-y-1 text-xs">
                       <div className="flex justify-between">
                          <span className="text-gray-400">Mode:</span>
                          <span className="text-white font-mono">{last.mode === 'auto' ? 'AUTO' : 'CONFIRM'}</span>
                       </div>
                       <div className="flex justify-between">
                          <span className="text-gray-400">Executed:</span>
                          <span className={last.result.executed ? 'text-green-400 font-bold' : 'text-yellow-400 font-bold'}>
                             {last.result.executed ? 'YES' : 'NO'}
                          </span>
                       </div>
                       <div className="flex justify-between">
                          <span className="text-gray-400">Confirmation Required:</span>
                          <span className="text-white">{last.result.requiresConfirmation ? 'YES' : 'NO'}</span>
                       </div>
                    </div>
                  </div>

                  <div className="bg-black/20 p-3 rounded border border-gray-800">
                    <div className="text-[10px] text-gray-500 uppercase font-bold mb-2">Guardrails</div>
                    <div className="space-y-1 text-xs">
                       <div className="flex justify-between">
                          <span className="text-gray-400">Risk Allowed:</span>
                          <span className={last.result.allowedByGuard ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                             {last.result.allowedByGuard ? 'YES' : 'NO'}
                          </span>
                       </div>
                       <div className="flex justify-between">
                          <span className="text-gray-400">Hard Blocked:</span>
                          <span className={last.result.hardBlocked ? 'text-red-400 font-bold' : 'text-gray-500'}>
                             {last.result.hardBlocked ? 'YES' : 'NO'}
                          </span>
                       </div>
                    </div>
                  </div>
                </div>

                {last.result.reasons.length > 0 && (
                  <div className="bg-red-500/5 border border-red-900/30 rounded p-3">
                    <div className="text-red-400 text-xs font-bold mb-2 flex items-center gap-2">
                       <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                       Block Reasons
                    </div>
                    <ul className="list-disc list-inside text-[11px] text-red-200 space-y-1">
                      {last.result.reasons.map((r, idx) => (
                        <li key={idx}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {last.result.warnings.length > 0 && (
                  <div className="bg-yellow-500/5 border border-yellow-900/30 rounded p-3">
                    <div className="text-yellow-400 text-xs font-bold mb-2 flex items-center gap-2">
                       <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                       Warnings
                    </div>
                    <ul className="list-disc list-inside text-[11px] text-yellow-200 space-y-1">
                      {last.result.warnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {last.result.guardMetrics && (
                  <div className="mt-4">
                    <details className="group">
                      <summary className="cursor-pointer text-[10px] text-gray-500 uppercase font-bold hover:text-white flex items-center gap-2">
                         <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-open:rotate-90"><polyline points="9 18 15 12 9 6"></polyline></svg>
                         Raw Guard Metrics
                      </summary>
                      <div className="mt-2 bg-black/40 p-3 rounded border border-gray-800">
                        <pre className="text-[10px] text-gray-400 font-mono whitespace-pre-wrap">
                          {JSON.stringify(last.result.guardMetrics, null, 2)}
                        </pre>
                      </div>
                    </details>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AutopilotPanel;

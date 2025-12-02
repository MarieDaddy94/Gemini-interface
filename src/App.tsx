
import React, { useMemo, useState, useEffect, useRef } from 'react';
import ChatOverlay, { ChatOverlayHandle } from './components/ChatOverlay';
import WebBrowser from './components/WebBrowser';
import ConnectBrokerModal from './components/ConnectBrokerModal';
import SettingsModal from './components/SettingsModal';
import JournalPanel from './components/JournalPanel';
import PlaybookArchive from './components/PlaybookArchive';
import AnalyticsPanel from './components/AnalyticsPanel';
import AutopilotPanel from './components/AutopilotPanel';
import RiskAutopilotPanel from './components/RiskAutopilotPanel';
import RoundTablePanel from './components/RoundTablePanel';
import ChartVisionAgentPanel from './components/ChartVisionAgentPanel';
import VoiceCommander from './components/VoiceCommander';
import TraderCoachPanel from './components/TraderCoachPanel';
import AgentSettingsPanel from './components/AgentSettingsPanel';
import AccessGate from './components/AccessGate';

// Hooks & Contexts (Providers now handled in AppProviders.tsx)
import { useJournal } from './context/JournalContext';
import { useTradeEvents } from './context/TradeEventsContext';
import { useAppWorld, AppRoom } from './context/AppWorldContext';

import {
  TradeLockerCredentials,
  BrokerAccountInfo,
  TradeLockerAccountSummary,
  PlaybookReviewPayload,
  BrokerEvent,
  MarketTick,
  AutopilotCommand,
  RiskVerdict
} from './types';
import { buildPlaybookReviewPrompt } from './utils/journalPrompts';
import {
  connectToTradeLocker,
  fetchBrokerData,
  selectTradeLockerAccount
} from './services/tradeLockerService';
import {
  detectFocusSymbolFromPositions,
  FocusSymbol
} from './symbolMap';
import { fetchJournalEntries } from './services/journalService';

function extractChartContextFromUrl(rawUrl: string): { symbol?: string; timeframe?: string } {
  try {
    const url = new URL(rawUrl);
    const symbolParam = url.searchParams.get('symbol') || undefined;
    const intervalParam = url.searchParams.get('interval') || undefined;
    let pathSymbol: string | undefined;
    const parts = url.pathname.split('/').filter(Boolean);
    const symIdx = parts.findIndex(p =>
      p.toLowerCase() === 'symbols' || p.toLowerCase() === 'symbol'
    );
    if (symIdx >= 0 && parts[symIdx + 1]) {
      pathSymbol = parts[symIdx + 1];
    }
    const symbol = symbolParam ?? pathSymbol;
    let timeframe: string | undefined;
    if (intervalParam) {
      const n = Number(intervalParam);
      if (!Number.isNaN(n)) {
        if (n < 60) timeframe = `${n}m`;
        else if (n === 60) timeframe = '1h';
        else timeframe = `${n}m`;
      } else {
        timeframe = intervalParam;
      }
    }
    return { symbol, timeframe };
  } catch {
    return {};
  }
}

// Inner App Component that uses Contexts
const Dashboard: React.FC = () => {
  // --- AppWorld Integration ---
  const { state: worldState, actions: worldActions } = useAppWorld();
  const { currentRoom, activeOverlay } = worldState;
  const { openRoom, openOverlay, closeOverlay } = worldActions;

  // Local UI state
  const [autopilotHasNew, setAutopilotHasNew] = useState(false);

  const tabs: { id: AppRoom; label: string }[] = [
    { id: 'terminal', label: 'Terminal' },
    { id: 'command', label: 'Command Center' },
    { id: 'autopilot', label: 'Autopilot' },
    { id: 'journal', label: 'Journal' },
    { id: 'analysis', label: 'Analysis' },
    { id: 'analytics', label: 'Analytics' },
  ];

  // Persistent Session
  const [journalSessionId] = useState<string>(() => {
    if (typeof window === 'undefined') return 'local-session';
    const key = 'ai-trading-analyst-session-id';
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const fresh = `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    window.localStorage.setItem(key, fresh);
    return fresh;
  });

  // Broker State
  const [brokerSessionId, setBrokerSessionId] = useState<string | null>(null);
  const [brokerData, setBrokerData] = useState<BrokerAccountInfo | null>(null);
  const [accounts, setAccounts] = useState<TradeLockerAccountSummary[]>([]);
  const [activeAccount, setActiveAccount] = useState<TradeLockerAccountSummary | null>(null);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  
  // Real-time Data State
  const [marketData, setMarketData] = useState<Record<string, MarketTick>>({});
  const wsRef = useRef<WebSocket | null>(null);

  // Toasts
  const [toast, setToast] = useState<{msg: string, type: 'success'|'info'}|null>(null);

  // Chart State
  const [chartSymbol, setChartSymbol] = useState<string>('US30');
  const [chartTimeframe, setChartTimeframe] = useState<string>('15m');
  const [autoFocusSymbol, setAutoFocusSymbol] = useState<FocusSymbol>('Auto');

  // Autopilot Command State (Shared between RoundTable and Autopilot Panel)
  const [agentAutopilotCommand, setAgentAutopilotCommand] = useState<AutopilotCommand | null>(null);
  const [agentRiskVerdict, setAgentRiskVerdict] = useState<RiskVerdict | null>(null);
  const [agentRiskComment, setAgentRiskComment] = useState<string | null>(null);

  const effectiveJournalSessionId = brokerSessionId || journalSessionId;
  const chatOverlayRef = useRef<ChatOverlayHandle | null>(null);
  
  const { setEntries } = useJournal();
  const { addEvent } = useTradeEvents();

  useEffect(() => {
    if(toast) {
      const t = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // WEBSOCKET: Real-time Market Data Feed
  useEffect(() => {
    if (wsRef.current) return;
    // Determine WS URL based on env or default
    const apiBase = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000';
    const wsBase = apiBase.replace(/^http/, 'ws');
    const wsUrl = `${wsBase}/ws`;
    
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => console.log('Connected to Real-time Market Data Feed');
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'SNAPSHOT' || msg.type === 'UPDATE') {
            const updates = msg.data as Record<string, MarketTick>;
            setMarketData(prev => ({ ...prev, ...updates }));
          }
        } catch (err) {
          // Silent catch for parsing errors on stream
        }
      };
      ws.onclose = () => {
        console.log('Market Data Feed Disconnected');
        wsRef.current = null;
      };
      ws.onerror = () => {
        if (wsRef.current) wsRef.current.close();
      };
    } catch (e) {
      console.warn("WebSocket connection failed (Backend likely down)");
    }
    
    return () => {
      if (wsRef.current && wsRef.current.readyState === 1) wsRef.current.close();
    };
  }, []);

  // POLL BROKER DATA & HANDLE EVENTS
  useEffect(() => {
    let interval: number | undefined;

    if (brokerSessionId) {
      const fetchData = async () => {
        try {
          const data = await fetchBrokerData(brokerSessionId);
          setBrokerData(data);

          if (data.recentEvents && data.recentEvents.length > 0) {
            let needsJournalRefresh = false;

            data.recentEvents.forEach((evt: BrokerEvent) => {
              if (evt.type === 'POSITION_CLOSED') {
                const pnl = evt.data.pnl || 0;
                setToast({
                  msg: `Trade Closed: ${evt.data.symbol} (${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)})`,
                  type: pnl >= 0 ? 'success' : 'info'
                });
                
                addEvent({
                  id: evt.data.id,
                  symbol: evt.data.symbol,
                  side: evt.data.side === 'buy' ? 'long' : 'short',
                  openedAt: new Date().toISOString(),
                  closedAt: new Date().toISOString(),
                  entryPrice: evt.data.entryPrice || 0,
                  exitPrice: evt.data.exitPrice || 0,
                  size: evt.data.size || 0,
                  pnl: pnl,
                  currency: 'USD',
                  source: 'broker',
                  agentId: 'system',
                  agentName: 'Broker'
                });

                needsJournalRefresh = true;
              } else if (evt.type === 'ORDER_FILLED') {
                setToast({
                  msg: `Order Filled: ${evt.data.side?.toUpperCase()} ${evt.data.symbol}`,
                  type: 'info'
                });
              }
            });

            if (needsJournalRefresh) {
               fetchJournalEntries(effectiveJournalSessionId).then(entries => {
                 setEntries(entries);
               });
            }
          }

        } catch (e) {
          console.warn('Failed to poll broker data (Backend likely down)');
        }
      };

      fetchData();
      interval = window.setInterval(fetchData, 3000);
    }

    return () => {
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, [brokerSessionId, effectiveJournalSessionId, setEntries, addEvent]);

  useEffect(() => {
    if (brokerData && brokerData.isConnected) {
      const detected = detectFocusSymbolFromPositions(brokerData.positions);
      setAutoFocusSymbol(detected);
    } else {
      setAutoFocusSymbol('Auto');
    }
  }, [brokerData]);

  const handleBrokerConnect = async (creds: TradeLockerCredentials) => {
    const { sessionId, accounts, accountId } = await connectToTradeLocker(creds);
    setBrokerSessionId(sessionId);
    setAccounts(accounts);
    const initial = accounts.find((a) => String(a.id) === String(accountId)) || accounts[0] || null;
    setActiveAccount(initial);
  };

  const handleDisconnect = () => {
    setBrokerSessionId(null);
    setBrokerData(null);
    setAccounts([]);
    setActiveAccount(null);
    setIsAccountMenuOpen(false);
    setAutoFocusSymbol('Auto');
  };

  const handleSelectAccount = async (account: TradeLockerAccountSummary) => {
    if (!brokerSessionId) return;
    try {
      await selectTradeLockerAccount(brokerSessionId, account.id, account.accNum);
      setActiveAccount(account);
      setIsAccountMenuOpen(false);
    } catch (err) {
      console.error('Failed to switch TradeLocker account', err);
    }
  };
  
  const handleRequestPlaybookReview = (payload: PlaybookReviewPayload) => {
    const prompt = buildPlaybookReviewPrompt(payload);
    chatOverlayRef.current?.sendSystemMessageToAgent({
      prompt,
      agentId: 'journal_coach',
    });
  };

  const handleBrowserUrlChange = (url: string) => {
    const { symbol, timeframe } = extractChartContextFromUrl(url);
    if (symbol) setChartSymbol(symbol);
    if (timeframe) setChartTimeframe(timeframe);
  };

  const handleTabChange = (tabId: AppRoom) => {
    openRoom(tabId);
    if (tabId === 'autopilot') {
      setAutopilotHasNew(false);
    }
  };

  const marketContext = useMemo(() => {
    const liveDataStr = Object.values(marketData)
      .map(tick => 
        `${tick.symbol}: ${tick.price.toFixed(2)} ` +
        `(${tick.change >= 0 ? '+' : ''}${tick.changePercent.toFixed(2)}%) ` +
        `| RSI(14): ${tick.rsi?.toFixed(1) || '-'} ` +
        `| SMA(20): ${tick.sma?.toFixed(2) || '-'}`
      )
      .join('\n');

    if (brokerData && brokerData.isConnected) {
      const positionsStr = brokerData.positions
        .map((p) => `${p.side.toUpperCase()} ${p.size} ${p.symbol} @ ${p.entryPrice} (PnL: $${p.pnl})`)
        .join('; ');
      const focusLine = autoFocusSymbol && autoFocusSymbol !== 'Auto' ? `Focus Symbol: ${autoFocusSymbol}.` : '';

      return `
        ACCOUNT STATUS: Connected to TradeLocker.
        Equity: $${brokerData.equity.toFixed(2)}. Balance: $${brokerData.balance.toFixed(2)}.
        ${focusLine}
        Open Positions: [${positionsStr || 'None'}].
        
        LIVE MARKET FEED:
        ${liveDataStr || 'Waiting for tick data...'}
      `;
    }

    return `
      LIVE MARKET FEED (Simulated):
      ${liveDataStr || 'Waiting for tick data...'}
    `;
  }, [brokerData, autoFocusSymbol, marketData]);

  const openPnl = brokerData && brokerData.isConnected ? brokerData.equity - brokerData.balance : 0;

  return (
    <div className="flex h-screen w-full bg-[#131722] text-[#d1d4dc] overflow-hidden relative">
      {/* Toast Notification */}
      {toast && (
        <div className={`absolute top-16 right-4 z-50 px-4 py-3 rounded-md shadow-lg border animate-fade-in-down flex items-center gap-3 ${
           toast.type === 'success' ? 'bg-[#1e222d] border-green-500/50 text-green-400' : 'bg-[#1e222d] border-blue-500/50 text-blue-400'
        }`}>
           <span className="text-xl">{toast.type === 'success' ? '💸' : 'ℹ️'}</span>
           <span className="font-medium text-sm">{toast.msg}</span>
        </div>
      )}

      {/* Main Trading Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 border-b border-[#2a2e39] flex items-center px-4 justify-between bg-[#131722] z-20 shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-white font-bold">
              <svg className="w-6 h-6 text-[#2962ff]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L2 7l10 5 10-5-10-5zm0 9l2.5-1.25L12 8.5l-2.5 1.25L12 11zm0 2.5l-5-2.5-5 2.5L12 22l10-8.5-5-2.5-5 2.5z" />
              </svg>
              <span>TradingView <span className="text-[#2962ff]">Pro</span></span>
            </div>
            <div className="h-4 w-[1px] bg-[#2a2e39] mx-2"></div>
            <div className="flex items-center gap-2 text-sm">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${currentRoom === tab.id ? 'bg-[#2962ff]/10 text-[#2962ff] border border-[#2962ff]/30' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/40'} relative`}
                >
                  {tab.label}
                  {tab.id === 'autopilot' && autopilotHasNew && currentRoom !== 'autopilot' && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => openOverlay('settings')} 
              className={`text-gray-400 hover:text-white transition-colors ${activeOverlay === 'settings' ? 'text-white' : ''}`} 
              title="Settings & API Keys"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 0 2.83 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
            </button>
            <div className="h-4 w-[1px] bg-[#2a2e39] mx-1"></div>
            {brokerSessionId ? (
              <div className="flex items-center gap-3 bg-[#1e222d] border border-[#2a2e39] rounded px-3 py-1 relative">
                <div className="flex flex-col items-end leading-tight mr-2">
                  <span className="text-[10px] text-gray-400">Equity</span>
                  <span className={`text-xs font-bold ${brokerData && brokerData.equity >= brokerData.balance ? 'text-[#089981]' : 'text-[#f23645]'}`}>${brokerData?.equity.toFixed(2) || '0.00'}</span>
                </div>
                {brokerData && (
                  <div className="flex flex-col items-end leading-tight mr-2">
                    <span className="text-[10px] text-gray-400">Open PnL</span>
                    <span className={`text-xs font-bold ${openPnl >= 0 ? 'text-[#089981]' : 'text-[#f23645]'}`}>${openPnl.toFixed(2)}</span>
                  </div>
                )}
                {activeAccount && (
                  <div className="relative">
                    <button type="button" onClick={() => setIsAccountMenuOpen((prev) => !prev)} className="flex items-center gap-1 text-[10px] bg-[#131722] px-2 py-1 rounded border border-[#2a2e39] hover:border-[#2962ff] transition-colors">
                      <span className="font-semibold">{activeAccount.name}</span>
                      <span className="text-[9px] text-gray-400">#{activeAccount.accNum}</span>
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </button>
                    {isAccountMenuOpen && (
                      <div className="absolute right-0 mt-1 w-56 bg-[#1e222d] border border-[#2a2e39] rounded shadow-lg z-30">
                        <div className="px-3 py-2 border-b border-[#2a2e39] text-[10px] text-gray-400">Select Account</div>
                        <div className="max-h-60 overflow-y-auto">
                          {accounts.map((acc) => (
                            <button key={acc.id} type="button" onClick={() => handleSelectAccount(acc)} className={`w-full text-left px-3 py-2 text-[11px] hover:bg-[#2a2e39] flex justify-between items-center ${activeAccount && activeAccount.id === acc.id ? 'bg-[#2a2e39]' : ''}`}>
                              <div className="flex flex-col">
                                <span className="font-semibold text-gray-100">{acc.name}</span>
                                <span className="text-[10px] text-gray-400">#{acc.accNum} • {acc.currency} {acc.isDemo ? '• Demo' : '• Live'}</span>
                              </div>
                              <span className="text-[10px] text-[#089981] font-semibold">${acc.balance.toFixed(2)}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div className="h-6 w-[1px] bg-[#2a2e39] mx-1"></div>
                <button onClick={handleDisconnect} className="text-[10px] text-red-400 hover:text-red-300 font-medium">Disconnect</button>
              </div>
            ) : (
              <button onClick={() => openOverlay('broker')} className="flex items-center gap-2 text-xs bg-[#2962ff] hover:bg-[#1e53e5] text-white py-1.5 px-3 rounded font-medium transition-colors">Connect Broker</button>
            )}
            <div className="h-4 w-[1px] bg-[#2a2e39] mx-1"></div>
            <div className="flex items-center gap-2 text-xs bg-[#2a2e39] py-1 px-2 rounded text-[#d1d4dc]">
              <span className={`w-2 h-2 rounded-full ${wsRef.current ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
              {wsRef.current ? 'Live Feed' : 'Offline'}
            </div>
            <div className="w-8 h-8 rounded-full bg-[#2a2e39] flex items-center justify-center text-xs border border-[#2a2e39] hover:border-[#2962ff] cursor-pointer transition-colors">JD</div>
          </div>
        </header>

        <main className="flex-1 relative bg-[#131722] flex flex-col min-h-0">
          {/* Show WebBrowser ONLY for Terminal tab */}
          {currentRoom === 'terminal' && (
            <div className="flex-1 min-h-0">
              <WebBrowser onUrlChange={handleBrowserUrlChange} />
            </div>
          )}

          {/* Autopilot Tab */}
          {currentRoom === 'autopilot' && (
            <div className="flex-1 min-h-0 h-full">
               <AutopilotPanel 
                 agentProposedCommand={agentAutopilotCommand}
                 agentRiskVerdict={agentRiskVerdict}
                 agentRiskComment={agentRiskComment}
               />
            </div>
          )}
          
          {currentRoom === 'command' && (
            <div className="flex-1 min-h-0 flex overflow-hidden">
               {/* Left Column: Controls & Configuration */}
               <div className="flex-1 border-r border-[#2a2e39] overflow-hidden flex flex-col">
                  {/* 1. Risk Autopilot (Top Priority) - Reduced slightly to give space below */}
                  <div className="flex-[1.5] min-h-0 flex flex-col">
                     <RiskAutopilotPanel />
                  </div>
                  <div className="h-[1px] bg-[#2a2e39] shrink-0" />
                  
                  {/* 2. Voice Commander (Compact) */}
                  <div className="flex-none">
                     <VoiceCommander />
                  </div>
                  <div className="h-[1px] bg-[#2a2e39] shrink-0" />

                  {/* 3. Trader Coach (Moved from Right) */}
                  <div className="flex-1 min-h-0 flex flex-col">
                     <TraderCoachPanel />
                  </div>
                  <div className="h-[1px] bg-[#2a2e39] shrink-0" />

                  {/* 4. Agent Settings (Moved from Right) - Increased weight to "drag up" */}
                  <div className="flex-[1.5] min-h-0 flex flex-col">
                     <AgentSettingsPanel />
                  </div>
               </div>

               {/* Right Column: Visual Intelligence */}
               <div className="flex-1 overflow-hidden flex flex-col">
                  {/* 1. Round Table Chat (Split 50%) */}
                  <div className="flex-1 min-h-0 flex flex-col">
                     <RoundTablePanel onCommandProposed={(cmd, risk) => {
                       setAgentAutopilotCommand(cmd);
                       if (risk) {
                         setAgentRiskVerdict(risk.verdict);
                         setAgentRiskComment(risk.comment);
                       }
                       if (cmd) setAutopilotHasNew(true);
                     }} />
                  </div>
                  <div className="h-[1px] bg-[#2a2e39] shrink-0" />
                  
                  {/* 2. Chart Vision (Split 50%) */}
                  <div className="flex-1 min-h-0 flex flex-col">
                     <ChartVisionAgentPanel />
                  </div>
               </div>
            </div>
          )}
          
          {currentRoom === 'journal' && <div className="flex-1 min-h-0 flex flex-col"><JournalPanel onRequestPlaybookReview={handleRequestPlaybookReview} /></div>}
          {currentRoom === 'analysis' && <div className="flex-1 min-h-0 p-4 overflow-y-auto"><PlaybookArchive /></div>}
          {currentRoom === 'analytics' && <div className="flex-1 min-h-0 overflow-y-auto"><AnalyticsPanel /></div>}
        </main>
      </div>

      {/* Right Sidebar - Always ChatOverlay for now */}
      <ChatOverlay
        ref={chatOverlayRef}
        chartContext={marketContext}
        chartSymbol={chartSymbol}
        chartTimeframe={chartTimeframe}
        isBrokerConnected={!!brokerSessionId}
        sessionId={effectiveJournalSessionId}
        autoFocusSymbol={autoFocusSymbol}
        brokerSessionId={brokerSessionId}
        openPositions={brokerData?.positions}
      />
      
      <ConnectBrokerModal 
        isOpen={activeOverlay === 'broker'} 
        onClose={closeOverlay} 
        onConnect={handleBrokerConnect} 
      />
      <SettingsModal 
        isOpen={activeOverlay === 'settings'} 
        onClose={closeOverlay} 
      />
    </div>
  );
};

// Wrapper App
const App: React.FC = () => {
  return (
    <AccessGate>
      <Dashboard />
    </AccessGate>
  );
};

export default App;

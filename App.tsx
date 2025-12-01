
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { MOCK_CHARTS } from './constants';
import ChatOverlay, { ChatOverlayHandle } from './components/ChatOverlay';
import WebBrowser from './components/WebBrowser';
import ConnectBrokerModal from './components/ConnectBrokerModal';
import JournalPanel from './components/JournalPanel';
import PlaybookArchive from './components/PlaybookArchive';
import { JournalProvider } from './context/JournalContext';
import { TradeEventsProvider } from './context/TradeEventsContext';
import TradeEventsToJournal from './components/TradeEventsToJournal';
import {
  TradeLockerCredentials,
  BrokerAccountInfo,
  TradeLockerAccountSummary,
  PlaybookReviewPayload
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

type MainTab = 'terminal' | 'journal' | 'analysis' | 'screeners';

const App: React.FC = () => {
  // Persistent journal session id (per browser)
  const [journalSessionId] = useState<string>(() => {
    if (typeof window === 'undefined') {
      return 'local-session';
    }
    const key = 'ai-trading-analyst-session-id';
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const fresh = `sess-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    window.localStorage.setItem(key, fresh);
    return fresh;
  });

  // Top-level tab state
  const [activeTab, setActiveTab] = useState<MainTab>('terminal');

  const tabs: { id: MainTab; label: string }[] = [
    { id: 'terminal', label: 'Terminal' },
    { id: 'journal', label: 'Journal' },
    { id: 'analysis', label: 'Analysis' },
    { id: 'screeners', label: 'Screeners' },
  ];

  // Broker State
  const [isBrokerModalOpen, setIsBrokerModalOpen] = useState(false);
  const [brokerSessionId, setBrokerSessionId] = useState<string | null>(null);
  const [brokerData, setBrokerData] = useState<BrokerAccountInfo | null>(null);

  const [accounts, setAccounts] = useState<TradeLockerAccountSummary[]>([]);
  const [activeAccount, setActiveAccount] =
    useState<TradeLockerAccountSummary | null>(null);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);

  const [autoFocusSymbol, setAutoFocusSymbol] =
    useState<FocusSymbol>('Auto');

  // Effective journal id:
  // - If connected to TradeLocker, use backend session id (enables auto-outcome logic)
  // - Otherwise, use local persistent session id for offline journaling
  const effectiveJournalSessionId = brokerSessionId || journalSessionId;

  // Refs for Imperative Actions
  const chatOverlayRef = useRef<ChatOverlayHandle | null>(null);

  // Poll Broker Data when connected
  useEffect(() => {
    let interval: number | undefined;

    if (brokerSessionId) {
      const fetchData = async () => {
        try {
          const data = await fetchBrokerData(brokerSessionId);
          setBrokerData(data);
        } catch (e) {
          console.error('Failed to poll broker data', e);
        }
      };

      fetchData();
      interval = window.setInterval(fetchData, 3000);
    }

    return () => {
      if (interval !== undefined) {
        window.clearInterval(interval);
      }
    };
  }, [brokerSessionId]);

  // Auto-detect focus symbol from open positions
  useEffect(() => {
    if (brokerData && brokerData.isConnected) {
      const detected = detectFocusSymbolFromPositions(
        brokerData.positions
      );
      setAutoFocusSymbol(detected);
    } else {
      setAutoFocusSymbol('Auto');
    }
  }, [brokerData]);

  const handleBrokerConnect = async (creds: TradeLockerCredentials) => {
    const { sessionId, accounts, accountId } =
      await connectToTradeLocker(creds);

    setBrokerSessionId(sessionId);
    setAccounts(accounts);

    const initial =
      accounts.find((a) => String(a.id) === String(accountId)) ||
      accounts[0] ||
      null;
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
      await selectTradeLockerAccount(
        brokerSessionId,
        account.id,
        account.accNum
      );
      setActiveAccount(account);
      setIsAccountMenuOpen(false);
    } catch (err) {
      console.error('Failed to switch TradeLocker account', err);
    }
  };
  
  // Handler for Playbook Review Request from JournalPanel
  const handleRequestPlaybookReview = (payload: PlaybookReviewPayload) => {
    const prompt = buildPlaybookReviewPrompt(payload);
    
    // Send directly to the Journal Coach via the Chat Overlay
    chatOverlayRef.current?.sendSystemMessageToAgent({
      prompt,
      agentId: 'journal_coach', // Matches the ID in AGENT_UI_META and ACTIVE_AGENT_IDS
    });
  };

  // Merge Mock Market Data with Real Broker Data for the AI Context
  const marketContext = useMemo(() => {
    const baseContext = MOCK_CHARTS.map((c) => {
      const last = c.data[c.data.length - 1];
      const start = c.data[0];
      const change = (
        ((last.value - start.value) / start.value) *
        100
      ).toFixed(2);
      return `${c.symbol}: ${last.value.toFixed(2)} (${change}%)`;
    }).join(', ');

    if (brokerData && brokerData.isConnected) {
      const positionsStr = brokerData.positions
        .map(
          (p) =>
            `${p.side.toUpperCase()} ${p.size} ${p.symbol} @ ${p.entryPrice} (PnL: $${p.pnl})`
        )
        .join('; ');

      const focusLine =
        autoFocusSymbol && autoFocusSymbol !== 'Auto'
          ? `Focus Symbol: ${autoFocusSymbol}.`
          : '';

      return `
        ACCOUNT STATUS: Connected to TradeLocker.
        Equity: $${brokerData.equity.toFixed(2)}. Balance: $${brokerData.balance.toFixed(2)}.
        ${focusLine}
        Open Positions: [${positionsStr || 'None'}].
        Market Prices (Reference): ${baseContext}
      `;
    }

    return `Market Prices (Reference): ${baseContext}`;
  }, [brokerData, autoFocusSymbol]);

  const openPnl =
    brokerData && brokerData.isConnected
      ? brokerData.equity - brokerData.balance
      : 0;

  return (
    <JournalProvider>
    <TradeEventsProvider>
    <TradeEventsToJournal />
    <div className="flex h-screen w-full bg-[#131722] text-[#d1d4dc] overflow-hidden">
      {/* Main Trading Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Navigation Bar */}
        <header className="h-12 border-b border-[#2a2e39] flex items-center px-4 justify-between bg-[#131722] z-20 shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-white font-bold">
              <svg
                className="w-6 h-6 text-[#2962ff]"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5zm0 9l2.5-1.25L12 8.5l-2.5 1.25L12 11zm0 2.5l-5-2.5-5 2.5L12 22l10-8.5-5-2.5-5 2.5z" />
              </svg>
              <span>
                TradingView <span className="text-[#2962ff]">Pro</span>
              </span>
            </div>
            <div className="h-4 w-[1px] bg-[#2a2e39] mx-2"></div>
            
            {/* TABS */}
            <div className="flex items-center gap-2 text-sm">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    px-3 py-1 rounded-full text-xs font-medium transition-all
                    ${activeTab === tab.id
                      ? 'bg-[#2962ff]/10 text-[#2962ff] border border-[#2962ff]/30'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/40'}
                  `}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Broker Status + Account Picker */}
            {brokerSessionId ? (
              <div className="flex items-center gap-3 bg-[#1e222d] border border-[#2a2e39] rounded px-3 py-1 relative">
                <div className="flex flex-col items-end leading-tight mr-2">
                  <span className="text-[10px] text-gray-400">Equity</span>
                  <span
                    className={`text-xs font-bold ${
                      brokerData && brokerData.equity >= brokerData.balance
                        ? 'text-[#089981]'
                        : 'text-[#f23645]'
                    }`}
                  >
                    ${brokerData?.equity.toFixed(2) || '0.00'}
                  </span>
                </div>
                {brokerData && (
                  <div className="flex flex-col items-end leading-tight mr-2">
                    <span className="text-[10px] text-gray-400">
                      Open PnL
                    </span>
                    <span
                      className={`text-xs font-bold ${
                        openPnl >= 0 ? 'text-[#089981]' : 'text-[#f23645]'
                      }`}
                    >
                      ${openPnl.toFixed(2)}
                    </span>
                  </div>
                )}

                {/* Account picker */}
                {activeAccount && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setIsAccountMenuOpen((prev) => !prev)
                      }
                      className="flex items-center gap-1 text-[10px] bg-[#131722] px-2 py-1 rounded border border-[#2a2e39] hover:border-[#2962ff] transition-colors"
                    >
                      <span className="font-semibold">
                        {activeAccount.name}
                      </span>
                      <span className="text-[9px] text-gray-400">
                        #{activeAccount.accNum}
                      </span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                    </button>
                    {isAccountMenuOpen && (
                      <div className="absolute right-0 mt-1 w-56 bg-[#1e222d] border border-[#2a2e39] rounded shadow-lg z-30">
                        <div className="px-3 py-2 border-b border-[#2a2e39] text-[10px] text-gray-400">
                          Select Account
                        </div>
                        <div className="max-h-60 overflow-y-auto">
                          {accounts.map((acc) => (
                            <button
                              key={acc.id}
                              type="button"
                              onClick={() => handleSelectAccount(acc)}
                              className={`w-full text-left px-3 py-2 text-[11px] hover:bg-[#2a2e39] flex justify-between items-center ${
                                activeAccount &&
                                activeAccount.id === acc.id
                                  ? 'bg-[#2a2e39]'
                                  : ''
                              }`}
                            >
                              <div className="flex flex-col">
                                <span className="font-semibold text-gray-100">
                                  {acc.name}
                                </span>
                                <span className="text-[10px] text-gray-400">
                                  #{acc.accNum} • {acc.currency}{' '}
                                  {acc.isDemo ? '• Demo' : '• Live'}
                                </span>
                              </div>
                              <span className="text-[10px] text-[#089981] font-semibold">
                                ${acc.balance.toFixed(2)}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="h-6 w-[1px] bg-[#2a2e39] mx-1"></div>
                <button
                  onClick={handleDisconnect}
                  className="text-[10px] text-red-400 hover:text-red-300 font-medium"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsBrokerModalOpen(true)}
                className="flex items-center gap-2 text-xs bg-[#2962ff] hover:bg-[#1e53e5] text-white py-1.5 px-3 rounded font-medium transition-colors"
              >
                Connect Broker
              </button>
            )}

            <div className="h-4 w-[1px] bg-[#2a2e39] mx-1"></div>

            <div className="flex items-center gap-2 text-xs bg-[#2a2e39] py-1 px-2 rounded text-[#d1d4dc]">
              <span
                className={`w-2 h-2 rounded-full ${
                  brokerSessionId ? 'bg-green-500 animate-pulse' : 'bg-gray-500'
                }`}
              ></span>
              {brokerSessionId ? 'TradeLocker Linked' : 'System Idle'}
            </div>
            <div className="w-8 h-8 rounded-full bg-[#2a2e39] flex items-center justify-center text-xs border border-[#2a2e39] hover:border-[#2962ff] cursor-pointer transition-colors">
              JD
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 relative bg-[#131722] flex flex-col min-h-0">
          {activeTab === 'terminal' && (
            <div className="flex-1 min-h-0">
              <WebBrowser />
            </div>
          )}

          {activeTab === 'journal' && (
             <div className="flex-1 min-h-0 flex flex-col">
                <JournalPanel onRequestPlaybookReview={handleRequestPlaybookReview} />
             </div>
          )}

          {activeTab === 'analysis' && (
            <div className="flex-1 min-h-0 p-4 overflow-y-auto">
              <PlaybookArchive />
            </div>
          )}

          {activeTab === 'screeners' && (
            <div className="flex-1 min-h-0 flex items-center justify-center text-sm text-gray-400">
              Screeners view coming soon.
            </div>
          )}
        </main>
      </div>

      {/* AI Analyst Sidebar */}
      <ChatOverlay
        ref={chatOverlayRef}
        chartContext={marketContext}
        isBrokerConnected={!!brokerSessionId}
        sessionId={effectiveJournalSessionId}
        autoFocusSymbol={autoFocusSymbol}
        brokerSessionId={brokerSessionId}
      />

      {/* Broker Modal */}
      <ConnectBrokerModal
        isOpen={isBrokerModalOpen}
        onClose={() => setIsBrokerModalOpen(false)}
        onConnect={handleBrokerConnect}
      />
    </div>
    </TradeEventsProvider>
    </JournalProvider>
  );
};

export default App;

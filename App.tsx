import React, { useMemo, useState, useEffect } from 'react';
import { MOCK_CHARTS } from './constants';
import ChatOverlay from './components/ChatOverlay';
import WebBrowser from './components/WebBrowser';
import ConnectBrokerModal from './components/ConnectBrokerModal';
import JournalPanel from './components/JournalPanel';
import {
  TradeLockerCredentials,
  BrokerAccountInfo,
  TradeLockerAccountSummary
} from './types';
import {
  connectToTradeLocker,
  fetchBrokerData,
  selectTradeLockerAccount
} from './services/tradeLockerService';
import {
  detectFocusSymbolFromPositions,
  FocusSymbol
} from './symbolMap';

const App: React.FC = () => {
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

  // Journal UI
  const [isJournalOpen, setIsJournalOpen] = useState(false);

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

      fetchData(); // Initial fetch
      interval = window.setInterval(fetchData, 3000); // Poll every 3s
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
    const { sessionId, accounts, accountId, accNum } =
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
    setIsJournalOpen(false);
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
      // Broker polling loop will pick up the new account on next poll
    } catch (err) {
      console.error('Failed to switch TradeLocker account', err);
    }
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
            <div className="flex gap-4 text-sm font-medium text-[#d1d4dc]">
              <span className="text-white border-b-2 border-[#2962ff] pb-3.5 mt-3.5 cursor-pointer">
                Terminal
              </span>
              <span className="hover:text-white cursor-pointer py-3.5">
                Analysis
              </span>
              <span className="hover:text-white cursor-pointer py-3.5">
                Screeners
              </span>
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

            {/* Journal toggle */}
            <button
              onClick={() => setIsJournalOpen((prev) => !prev)}
              className={`flex items-center gap-1 text-xs py-1.5 px-3 rounded font-medium transition-colors border ${
                isJournalOpen
                  ? 'bg-[#2962ff] border-[#2962ff] text-white'
                  : 'bg-[#1e222d] border-[#2a2e39] text-[#d1d4dc] hover:border-[#2962ff]'
              }`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20" />
                <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z" />
                <path d="M8 7h8" />
                <path d="M8 11h5" />
              </svg>
              <span>Journal</span>
            </button>

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

        {/* Browser Container */}
        <main className="flex-1 relative bg-[#131722] flex flex-col">
          <WebBrowser />
        </main>
      </div>

      {/* AI Analyst Sidebar */}
      <ChatOverlay
        chartContext={marketContext}
        isBrokerConnected={!!brokerSessionId}
        autoFocusSymbol={autoFocusSymbol}
      />

      {/* Journal Panel */}
      {isJournalOpen && (
        <JournalPanel
          isOpen={isJournalOpen}
          onClose={() => setIsJournalOpen(false)}
          sessionId={brokerSessionId}
          autoFocusSymbol={autoFocusSymbol}
          brokerData={brokerData}
        />
      )}

      {/* Broker Modal */}
      <ConnectBrokerModal
        isOpen={isBrokerModalOpen}
        onClose={() => setIsBrokerModalOpen(false)}
        onConnect={handleBrokerConnect}
      />
    </div>
  );
};

export default App;

import React, { useMemo, useState, useRef } from 'react';
import { useAppWorld, AppRoom } from './context/AppWorldContext';
import { useBrokerSystem } from './hooks/useBrokerSystem';
import { useMarketDataFeed } from './hooks/useMarketDataFeed';
import { detectFocusSymbolFromPositions, FocusSymbol } from './symbolMap';
import { PlaybookReviewPayload } from './types';
import { buildPlaybookReviewPrompt } from './utils/journalPrompts';

import ChatOverlay, { ChatOverlayHandle } from './components/ChatOverlay';
import ConnectBrokerModal from './components/ConnectBrokerModal';
import SettingsModal from './components/SettingsModal';
import AccessGate from './components/AccessGate';
import AgentActionDispatcher from './components/AgentActionDispatcher'; 

import { AppProviders } from './context/AppProviders';

import TerminalView from './views/TerminalView';
import CommandCenterView from './views/CommandCenterView';
import AutopilotView from './views/AutopilotView';
import TradingRoomFloorView from './views/TradingRoomFloorView';
import JournalPanel from './components/JournalPanel';
import PlaybookArchive from './components/PlaybookArchive';
import AnalyticsPanel from './components/AnalyticsPanel';

function extractChartContextFromUrl(rawUrl: string): { symbol?: string; timeframe?: string } {
  try {
    const url = new URL(rawUrl);
    const symbolParam = url.searchParams.get('symbol');
    const intervalParam = url.searchParams.get('interval');
    return { symbol: symbolParam || undefined, timeframe: intervalParam || undefined };
  } catch { return {}; }
}

const Dashboard: React.FC = () => {
  const { state: worldState, actions: worldActions } = useAppWorld();
  const { currentRoom, activeOverlay, toast } = worldState;
  const { openRoom, openOverlay, closeOverlay } = worldActions;

  const { brokerSessionId, brokerData, connect: connectBroker } = useBrokerSystem();
  const { marketData } = useMarketDataFeed();

  const [chartSymbol, setChartSymbol] = useState<string>('US30');
  const [chartTimeframe, setChartTimeframe] = useState<string>('15m');
  const [autoFocusSymbol, setAutoFocusSymbol] = useState<FocusSymbol>('Auto');

  const effectiveJournalSessionId = brokerSessionId || 'local';
  const chatOverlayRef = useRef<ChatOverlayHandle | null>(null);
  
  const handleBrowserUrlChange = (url: string) => {
    const { symbol, timeframe } = extractChartContextFromUrl(url);
    if (symbol) setChartSymbol(symbol);
    if (timeframe) setChartTimeframe(timeframe);
  };

  const handleTabChange = (tabId: AppRoom) => {
    openRoom(tabId);
  };

  const handleRequestPlaybookReview = (payload: PlaybookReviewPayload) => {
    const prompt = buildPlaybookReviewPrompt(payload);
    chatOverlayRef.current?.sendSystemMessageToAgent({ prompt, agentId: 'journal_coach' });
  };

  const marketContext = useMemo(() => {
    return `Account: ${brokerData?.equity?.toFixed(2) ?? 0} | Live Feed: ${Object.keys(marketData).length} ticks`;
  }, [brokerData, marketData]);

  const tabs: { id: AppRoom; label: string }[] = [
    { id: 'terminal', label: 'Terminal' },
    { id: 'tradingRoomFloor', label: 'Desk' },
    { id: 'command', label: 'Command' },
    { id: 'autopilot', label: 'Autopilot' },
    { id: 'journal', label: 'Journal' },
    { id: 'analysis', label: 'Analysis' },
    { id: 'analytics', label: 'Analytics' },
  ];

  return (
    <div className="flex h-screen w-full bg-[#131722] text-[#d1d4dc] overflow-hidden relative">
      <AgentActionDispatcher />

      {toast && (
        <div className={`absolute top-16 right-4 z-[999] px-4 py-3 rounded-md shadow-lg border animate-fade-in-down flex items-center gap-3 bg-[#1e222d] border-blue-500/50 text-blue-400`}>
           <span className="font-medium text-sm">{toast.msg}</span>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 border-b border-[#2a2e39] flex items-center px-4 justify-between bg-[#131722] z-20 shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-white font-bold">
              <span>TradingView <span className="text-[#2962ff]">Pro</span></span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${currentRoom === tab.id ? 'bg-[#2962ff]/10 text-[#2962ff]' : 'text-slate-400 hover:text-slate-100'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
             <button onClick={() => openOverlay('settings')} className="text-gray-400 hover:text-white transition-colors">Settings</button>
             {/* Broker connection UI logic could go here */}
          </div>
        </header>

        <main className="flex-1 relative bg-[#131722] flex flex-col min-h-0">
          {currentRoom === 'terminal' && <TerminalView onUrlChange={handleBrowserUrlChange} />}
          {currentRoom === 'tradingRoomFloor' && <TradingRoomFloorView />}
          {currentRoom === 'command' && <CommandCenterView />}
          {currentRoom === 'autopilot' && <AutopilotView />}
          {currentRoom === 'journal' && <div className="flex-1 min-h-0 flex flex-col"><JournalPanel onRequestPlaybookReview={handleRequestPlaybookReview} /></div>}
          {currentRoom === 'analysis' && <div className="flex-1 min-h-0 p-4 overflow-y-auto"><PlaybookArchive /></div>}
          {currentRoom === 'analytics' && <div className="flex-1 min-h-0 overflow-y-auto"><AnalyticsPanel /></div>}
        </main>
      </div>

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
      
      <ConnectBrokerModal isOpen={activeOverlay === 'broker'} onClose={closeOverlay} onConnect={connectBroker} />
      <SettingsModal isOpen={activeOverlay === 'settings'} onClose={closeOverlay} />
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AccessGate>
      <AppProviders>
        <Dashboard />
      </AppProviders>
    </AccessGate>
  );
};

export default App;

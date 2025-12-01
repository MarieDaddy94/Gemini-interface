import React, { useMemo, useState, useEffect, useRef } from 'react';
import { MOCK_CHARTS } from './constants';
import ChatOverlay, { ChatOverlayHandle } from './components/ChatOverlay';
import TradingViewWidget from './components/TradingViewWidget';
import WebBrowser from './components/WebBrowser';
import ConnectBrokerModal from './components/ConnectBrokerModal';
import SettingsModal from './components/SettingsModal';
import JournalPanel from './components/JournalPanel';
import PlaybookArchive from './components/PlaybookArchive';
import AnalyticsPanel from './components/AnalyticsPanel';
import AutopilotPanel from './components/AutopilotPanel';
import AccessGate from './components/AccessGate';
import { JournalProvider } from './context/JournalContext';
import { TradeEventsProvider } from './context/TradeEventsContext';
import { AgentConfigProvider } from './context/AgentConfigContext';
import TradeEventsToJournal from './components/TradeEventsToJournal';
import { MarketTick } from './types';
import { fetchBrokerData } from './services/tradeLockerService';

type MainTab = 'terminal' | 'browser' | 'journal' | 'analysis' | 'analytics' | 'autopilot';

const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<MainTab>('terminal');
  const [marketData, setMarketData] = useState<Record<string, MarketTick>>({});
  const [chartSymbol, setChartSymbol] = useState('US30');
  const wsRef = useRef<WebSocket | null>(null);
  
  // Broker State
  const [brokerSessionId, setBrokerSessionId] = useState<string | null>(null);
  const [isBrokerModalOpen, setIsBrokerModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  useEffect(() => {
    if (wsRef.current) return;
    const wsUrl = `ws://localhost:4000/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'SNAPSHOT' || msg.type === 'UPDATE') {
          const updates = msg.data as Record<string, MarketTick>;
          setMarketData(prev => ({ ...prev, ...updates }));
        }
      } catch (err) {}
    };
    return () => { if (ws.readyState === 1) ws.close(); };
  }, []);

  const marketContext = useMemo(() => {
     return Object.values(marketData).map(t => `${t.symbol}: ${t.price.toFixed(2)}`).join(', ');
  }, [marketData]);

  return (
    <div className="flex h-screen w-full bg-[#131722] text-[#d1d4dc] overflow-hidden relative">
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 border-b border-[#2a2e39] flex items-center px-4 justify-between bg-[#131722] z-20 shrink-0">
          <div className="flex items-center gap-4">
            <span className="font-bold text-white">AI Terminal <span className="text-[#2962ff]">Pro</span></span>
            <div className="h-4 w-[1px] bg-[#2a2e39]"></div>
            <div className="flex gap-2">
               {['terminal', 'browser', 'autopilot', 'journal', 'analytics'].map(t => (
                 <button 
                   key={t}
                   onClick={() => setActiveTab(t as MainTab)}
                   className={`px-3 py-1 rounded text-xs uppercase font-bold ${activeTab === t ? 'text-[#2962ff] bg-[#2962ff]/10' : 'text-gray-500'}`}
                 >
                   {t}
                 </button>
               ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
             <button onClick={() => setIsSettingsModalOpen(true)} className="text-gray-400 hover:text-white">⚙️</button>
             <button onClick={() => setIsBrokerModalOpen(true)} className="bg-[#2962ff] text-white px-3 py-1 rounded text-xs">Connect</button>
          </div>
        </header>

        <main className="flex-1 relative bg-[#131722] flex flex-col min-h-0">
          {activeTab === 'terminal' && (
             <div className="w-full h-full relative">
                <TradingViewWidget />
             </div>
          )}
          {activeTab === 'browser' && <WebBrowser />}
          {activeTab === 'autopilot' && <AutopilotPanel chartContext={marketContext} brokerSessionId={brokerSessionId} symbol={chartSymbol} />}
          {activeTab === 'journal' && <JournalPanel />}
          {activeTab === 'analytics' && <AnalyticsPanel />}
        </main>
      </div>

      <ChatOverlay 
        chartContext={marketContext}
        chartSymbol={chartSymbol}
        sessionId="main"
        brokerSessionId={brokerSessionId}
      />
      
      <ConnectBrokerModal isOpen={isBrokerModalOpen} onClose={() => setIsBrokerModalOpen(false)} onConnect={async (c) => {
         // Mock connect
         setBrokerSessionId('mock-session');
      }} />
      <SettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} />
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AccessGate>
      <AgentConfigProvider>
        <JournalProvider>
          <TradeEventsProvider>
            <TradeEventsToJournal />
            <Dashboard />
          </TradeEventsProvider>
        </JournalProvider>
      </AgentConfigProvider>
    </AccessGate>
  );
};

export default App;
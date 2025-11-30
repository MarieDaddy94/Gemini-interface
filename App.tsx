import React, { useMemo, useState, useEffect } from 'react';
import { MOCK_CHARTS } from './constants';
import ChatOverlay from './components/ChatOverlay';
import WebBrowser from './components/WebBrowser'; // Import the new browser component
import ConnectBrokerModal from './components/ConnectBrokerModal';
import { TradeLockerCredentials, BrokerAccountInfo } from './types';
import { connectToTradeLocker, fetchBrokerData } from './services/tradeLockerService';

const App: React.FC = () => {
  // Broker State
  const [isBrokerModalOpen, setIsBrokerModalOpen] = useState(false);
  const [brokerToken, setBrokerToken] = useState<string | null>(null);
  const [brokerConfig, setBrokerConfig] = useState<{server: string, isDemo: boolean} | null>(null);
  const [brokerData, setBrokerData] = useState<BrokerAccountInfo | null>(null);

  // Poll Broker Data when connected
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (brokerToken && brokerConfig) {
      const fetchData = async () => {
        try {
          const data = await fetchBrokerData(brokerToken, brokerConfig.server, brokerConfig.isDemo);
          setBrokerData(data);
        } catch (e) {
          console.error("Failed to poll broker data", e);
        }
      };
      
      fetchData(); // Initial fetch
      interval = setInterval(fetchData, 3000); // Poll every 3s
    }

    return () => clearInterval(interval);
  }, [brokerToken, brokerConfig]);

  const handleBrokerConnect = async (creds: TradeLockerCredentials) => {
    const token = await connectToTradeLocker(creds);
    setBrokerToken(token);
    setBrokerConfig({ server: creds.server, isDemo: !!creds.isDemo });
  };

  const handleDisconnect = () => {
    setBrokerToken(null);
    setBrokerData(null);
    setBrokerConfig(null);
  };

  // Merge Mock Market Data with Real Broker Data for the AI Context
  const marketContext = useMemo(() => {
    const baseContext = MOCK_CHARTS.map(c => {
      const last = c.data[c.data.length - 1];
      const start = c.data[0];
      const change = ((last.value - start.value) / start.value * 100).toFixed(2);
      return `${c.symbol}: ${last.value.toFixed(2)} (${change}%)`;
    }).join(', ');

    if (brokerData && brokerData.isConnected) {
      const positionsStr = brokerData.positions.map(p => 
        `${p.side.toUpperCase()} ${p.size} ${p.symbol} @ ${p.entryPrice} (PnL: $${p.pnl})`
      ).join('; ');
      
      return `
        ACCOUNT STATUS: Connected to TradeLocker.
        Equity: $${brokerData.equity.toFixed(2)}. Balance: $${brokerData.balance.toFixed(2)}.
        Open Positions: [${positionsStr || "None"}].
        Market Prices (Reference): ${baseContext}
      `;
    }

    return `Market Prices (Reference): ${baseContext}`;
  }, [brokerData]);

  return (
    <div className="flex h-screen w-full bg-[#131722] text-[#d1d4dc] overflow-hidden">
      {/* Main Trading Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Navigation Bar */}
        <header className="h-12 border-b border-[#2a2e39] flex items-center px-4 justify-between bg-[#131722] z-20 shrink-0">
          <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-white font-bold">
                  <svg className="w-6 h-6 text-[#2962ff]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zm0 9l2.5-1.25L12 8.5l-2.5 1.25L12 11zm0 2.5l-5-2.5-5 2.5L12 22l10-8.5-5-2.5-5 2.5z"/></svg>
                  <span>TradingView <span className="text-[#2962ff]">Pro</span></span>
              </div>
              <div className="h-4 w-[1px] bg-[#2a2e39] mx-2"></div>
              <div className="flex gap-4 text-sm font-medium text-[#d1d4dc]">
                  <span className="text-white border-b-2 border-[#2962ff] pb-3.5 mt-3.5 cursor-pointer">Terminal</span>
                  <span className="hover:text-white cursor-pointer py-3.5">Analysis</span>
                  <span className="hover:text-white cursor-pointer py-3.5">Screeners</span>
              </div>
          </div>
          <div className="flex items-center gap-3">
               {/* Broker Status */}
               {brokerToken ? (
                 <div className="flex items-center gap-3 bg-[#1e222d] border border-[#2a2e39] rounded px-3 py-1">
                    <div className="flex flex-col items-end leading-tight">
                      <span className="text-[10px] text-gray-400">Equity</span>
                      <span className={`text-xs font-bold ${brokerData && brokerData.equity >= brokerData.balance ? 'text-[#089981]' : 'text-[#f23645]'}`}>
                        ${brokerData?.equity.toFixed(2) || '0.00'}
                      </span>
                    </div>
                    <div className="h-6 w-[1px] bg-[#2a2e39]"></div>
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
                 <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                 System Normal
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

      {/* AI Analyst Sidebar - Passing the enriched broker data context */}
      <ChatOverlay chartContext={marketContext} isBrokerConnected={!!brokerToken} />

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
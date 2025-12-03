
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo } from 'react';
import { BrokerAccountInfo, TradeLockerAccountSummary, TradeLockerCredentials, BrokerEvent } from '../types';
import { fetchBrokerData, connectToTradeLocker, selectTradeLockerAccount } from '../services/tradeLockerService';
import { useAppWorld } from './AppWorldContext';
import { useTradeEvents } from './TradeEventsContext';
import { useJournal } from './JournalContext';
import { fetchJournalEntries } from '../services/journalService';

export interface BrokerAiSnapshot {
  equity: number;
  balance: number;
  dayPnl: number;
  openPnl: number;
  positionCount: number;
  maxDrawdown: number;
}

interface BrokerContextValue {
  brokerSessionId: string | null;
  brokerData: BrokerAccountInfo | null;
  aiSnapshot: BrokerAiSnapshot | null;
  accounts: TradeLockerAccountSummary[];
  activeAccount: TradeLockerAccountSummary | null;
  loading: boolean;
  error: string | null;
  connect: (creds: TradeLockerCredentials) => Promise<void>;
  disconnect: () => void;
  switchAccount: (account: TradeLockerAccountSummary) => Promise<void>;
  refreshSnapshot: () => Promise<void>;
}

const BrokerContext = createContext<BrokerContextValue | undefined>(undefined);

export const BrokerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [brokerSessionId, setBrokerSessionId] = useState<string | null>(null);
  const [brokerData, setBrokerData] = useState<BrokerAccountInfo | null>(null);
  const [accounts, setAccounts] = useState<TradeLockerAccountSummary[]>([]);
  const [activeAccount, setActiveAccount] = useState<TradeLockerAccountSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { actions: { showToast, closeOverlay } } = useAppWorld();
  const { addEvent } = useTradeEvents();
  const { setEntries } = useJournal();

  // Unified Polling Loop
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;

    if (brokerSessionId) {
      const fetchData = async () => {
        try {
          const data = await fetchBrokerData(brokerSessionId);
          setBrokerData(data);
          setError(null);

          // Event Handling
          if (data.recentEvents && data.recentEvents.length > 0) {
            let needsJournalRefresh = false;

            data.recentEvents.forEach((evt: BrokerEvent) => {
              if (evt.type === 'POSITION_CLOSED') {
                const pnl = evt.data.pnl || 0;
                showToast(
                  `Trade Closed: ${evt.data.symbol} (${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)})`,
                  pnl >= 0 ? 'success' : 'info'
                );
                
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
                showToast(
                  `Order Filled: ${evt.data.side?.toUpperCase()} ${evt.data.symbol}`,
                  'info'
                );
              }
            });

            if (needsJournalRefresh) {
               fetchJournalEntries(brokerSessionId).then(entries => setEntries(entries));
            }
          }
        } catch (e: any) {
          console.warn('Failed to poll broker data', e);
        }
      };

      fetchData(); 
      interval = setInterval(fetchData, 3000); 
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [brokerSessionId, addEvent, showToast, setEntries]);

  // Derived AI Snapshot (Memoized)
  const aiSnapshot = useMemo<BrokerAiSnapshot | null>(() => {
    if (!brokerData) return null;
    return {
      equity: brokerData.equity,
      balance: brokerData.balance,
      dayPnl: (brokerData as any).dailyPnl ?? 0, // Fallback if type def missing
      openPnl: brokerData.equity - brokerData.balance,
      positionCount: brokerData.positions.length,
      maxDrawdown: (brokerData as any).dailyDrawdown ?? 0
    };
  }, [brokerData]);

  const connect = useCallback(async (creds: TradeLockerCredentials) => {
    setLoading(true);
    setError(null);
    try {
      const { sessionId, accounts, accountId } = await connectToTradeLocker(creds);
      setBrokerSessionId(sessionId);
      setAccounts(accounts);
      const initial = accounts.find((a) => String(a.id) === String(accountId)) || accounts[0] || null;
      setActiveAccount(initial);
      closeOverlay();
      showToast("Broker Connected Successfully", "success");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Connection failed");
      showToast(err.message || "Connection failed", "error");
    } finally {
      setLoading(false);
    }
  }, [closeOverlay, showToast]);

  const disconnect = useCallback(() => {
    setBrokerSessionId(null);
    setBrokerData(null);
    setAccounts([]);
    setActiveAccount(null);
    showToast("Broker Disconnected", "info");
  }, [showToast]);

  const switchAccount = useCallback(async (account: TradeLockerAccountSummary) => {
    if (!brokerSessionId) return;
    setLoading(true);
    try {
      await selectTradeLockerAccount(brokerSessionId, account.id, account.accNum);
      setActiveAccount(account);
      showToast(`Switched to ${account.name}`, "success");
      const data = await fetchBrokerData(brokerSessionId);
      setBrokerData(data);
    } catch (err: any) {
      console.error('Failed to switch account', err);
      showToast("Failed to switch account", "error");
    } finally {
      setLoading(false);
    }
  }, [brokerSessionId, showToast]);

  const refreshSnapshot = useCallback(async () => {
    if(!brokerSessionId) return;
    try {
        const data = await fetchBrokerData(brokerSessionId);
        setBrokerData(data);
    } catch(e) { console.error(e); }
  }, [brokerSessionId]);

  return (
    <BrokerContext.Provider value={{
      brokerSessionId,
      brokerData,
      aiSnapshot,
      accounts,
      activeAccount,
      loading,
      error,
      connect,
      disconnect,
      switchAccount,
      refreshSnapshot
    }}>
      {children}
    </BrokerContext.Provider>
  );
};

export const useBroker = () => {
  const ctx = useContext(BrokerContext);
  if (!ctx) throw new Error("useBroker must be used within BrokerProvider");
  return ctx;
};

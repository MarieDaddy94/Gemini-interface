
import { useState, useEffect } from 'react';
import { 
  BrokerAccountInfo, 
  TradeLockerAccountSummary, 
  TradeLockerCredentials,
  BrokerEvent 
} from '../types';
import { 
  connectToTradeLocker, 
  fetchBrokerData, 
  selectTradeLockerAccount 
} from '../services/tradeLockerService';
import { fetchJournalEntries } from '../services/journalService';
import { useJournal } from '../context/JournalContext';
import { useTradeEvents } from '../context/TradeEventsContext';
import { useAppWorld } from '../context/AppWorldContext';

export function useBrokerSystem() {
  const [brokerSessionId, setBrokerSessionId] = useState<string | null>(null);
  const [brokerData, setBrokerData] = useState<BrokerAccountInfo | null>(null);
  const [accounts, setAccounts] = useState<TradeLockerAccountSummary[]>([]);
  const [activeAccount, setActiveAccount] = useState<TradeLockerAccountSummary | null>(null);
  
  const { setEntries } = useJournal();
  const { addEvent } = useTradeEvents();
  const { actions: { showToast, closeOverlay } } = useAppWorld();

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
               // Refresh journal if a trade closed
               fetchJournalEntries(brokerSessionId).then(entries => {
                 setEntries(entries);
               });
            }
          }

        } catch (e) {
          console.warn('Failed to poll broker data');
        }
      };

      fetchData();
      interval = window.setInterval(fetchData, 3000);
    }

    return () => {
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, [brokerSessionId, setEntries, addEvent, showToast]);

  const connect = async (creds: TradeLockerCredentials) => {
    const { sessionId, accounts, accountId } = await connectToTradeLocker(creds);
    setBrokerSessionId(sessionId);
    setAccounts(accounts);
    const initial = accounts.find((a) => String(a.id) === String(accountId)) || accounts[0] || null;
    setActiveAccount(initial);
    closeOverlay(); // Close modal on success
  };

  const disconnect = () => {
    setBrokerSessionId(null);
    setBrokerData(null);
    setAccounts([]);
    setActiveAccount(null);
  };

  const switchAccount = async (account: TradeLockerAccountSummary) => {
    if (!brokerSessionId) return;
    try {
      await selectTradeLockerAccount(brokerSessionId, account.id, account.accNum);
      setActiveAccount(account);
    } catch (err) {
      console.error('Failed to switch TradeLocker account', err);
      showToast('Failed to switch account', 'error');
    }
  };

  return {
    brokerSessionId,
    brokerData,
    accounts,
    activeAccount,
    connect,
    disconnect,
    switchAccount
  };
}

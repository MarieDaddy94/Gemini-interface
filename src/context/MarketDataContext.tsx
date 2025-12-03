
import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { MarketTick } from '../types';

interface MarketDataContextValue {
  marketData: Record<string, MarketTick>;
  isConnected: boolean;
}

const MarketDataContext = createContext<MarketDataContextValue | undefined>(undefined);

export const MarketDataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [marketData, setMarketData] = useState<Record<string, MarketTick>>({});
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Prevent double-init
    if (wsRef.current) return;

    // Determine WS URL based on env or default
    const apiBase = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000';
    const wsBase = apiBase.replace(/^http/, 'ws');
    const wsUrl = `${wsBase}/ws`;

    const connect = () => {
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setIsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'SNAPSHOT' || msg.type === 'UPDATE') {
              const updates = msg.data as Record<string, MarketTick>;
              setMarketData(prev => ({ ...prev, ...updates }));
            }
          } catch (err) {
            // Silent catch for malformed frames
          }
        };

        ws.onclose = () => {
          setIsConnected(false);
          wsRef.current = null;
          // Simple reconnect backoff
          setTimeout(connect, 3000);
        };

        ws.onerror = (e) => {
          console.warn("[MarketFeed] WS Error", e);
          if (wsRef.current) wsRef.current.close();
        };
      } catch (e) {
        console.warn("[MarketFeed] Connection failed", e);
        setTimeout(connect, 5000);
      }
    };

    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  return (
    <MarketDataContext.Provider value={{ marketData, isConnected }}>
      {children}
    </MarketDataContext.Provider>
  );
};

export const useMarketDataContext = () => {
  const ctx = useContext(MarketDataContext);
  if (!ctx) throw new Error("useMarketDataContext must be used within MarketDataProvider");
  return ctx;
};

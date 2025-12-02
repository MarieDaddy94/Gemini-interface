
import { useEffect, useRef, useState } from 'react';
import { MarketTick } from '../types';

export function useMarketDataFeed() {
  const [marketData, setMarketData] = useState<Record<string, MarketTick>>({});
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (wsRef.current) return;
    
    // Determine WS URL based on env or default
    const apiBase = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000';
    const wsBase = apiBase.replace(/^http/, 'ws');
    const wsUrl = `${wsBase}/ws`;
    
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      // ws.onopen = () => console.log('[MarketFeed] Connected');
      
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'SNAPSHOT' || msg.type === 'UPDATE') {
            const updates = msg.data as Record<string, MarketTick>;
            setMarketData(prev => ({ ...prev, ...updates }));
          }
        } catch (err) {
          // Silent catch
        }
      };

      ws.onclose = () => {
        // console.log('[MarketFeed] Disconnected');
        wsRef.current = null;
      };

      ws.onerror = () => {
        if (wsRef.current) wsRef.current.close();
      };
    } catch (e) {
      console.warn("[MarketFeed] Connection failed (Backend likely down)");
    }
    
    return () => {
      if (wsRef.current && wsRef.current.readyState === 1) {
        wsRef.current.close();
      }
    };
  }, []);

  return { marketData, isConnected: !!wsRef.current };
}

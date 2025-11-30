import { TradeLockerCredentials, BrokerAccountInfo } from '../types';

// Mock state for demo purposes
let mockPositions = [
  { id: '1', symbol: 'BTCUSD', side: 'buy' as const, size: 0.5, entryPrice: 63500, currentPrice: 64200, pnl: 350 },
  { id: '2', symbol: 'EURUSD', side: 'sell' as const, size: 1.0, entryPrice: 1.0920, currentPrice: 1.0850, pnl: 70 },
  { id: '3', symbol: 'XAUUSD', side: 'buy' as const, size: 0.1, entryPrice: 2010, currentPrice: 2005, pnl: -50 }
];

export const connectToTradeLocker = async (creds: TradeLockerCredentials): Promise<string> => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1500));

  if (creds.isDemo) {
    return 'mock-jwt-token-123';
  }

  // Real API implementation structure
  try {
    const response = await fetch(`${creds.server}/auth/jwt/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: creds.email, password: creds.password })
    });

    if (!response.ok) {
      throw new Error('Authentication failed: Invalid credentials or server');
    }

    const data = await response.json();
    return data.access_token || 'mock-token'; // Fallback for prototype if API shape differs
  } catch (error) {
    console.error("TradeLocker Connection Error:", error);
    throw error;
  }
};

export const fetchBrokerData = async (token: string, server: string, isDemo: boolean): Promise<BrokerAccountInfo> => {
  if (isDemo || token === 'mock-jwt-token-123') {
    // Simulate live market movements
    mockPositions = mockPositions.map(pos => {
      const volatility = pos.symbol === 'BTCUSD' ? 50 : 0.001;
      const change = (Math.random() - 0.5) * volatility;
      const newPrice = pos.currentPrice + change;
      // Recalculate PnL roughly
      const pnlChange = pos.side === 'buy' ? change : -change;
      const pnlMultiplier = pos.symbol === 'BTCUSD' ? 1 : 100000; // Rough pip value scaling
      
      return {
        ...pos,
        currentPrice: Number(newPrice.toFixed(pos.symbol === 'BTCUSD' ? 2 : 5)),
        pnl: Number((pos.pnl + (pnlChange * pos.size * (pos.symbol === 'BTCUSD' ? 1 : 10))).toFixed(2))
      };
    });

    const totalPnL = mockPositions.reduce((acc, curr) => acc + curr.pnl, 0);
    const balance = 10000;

    return {
      isConnected: true,
      balance: balance,
      equity: balance + totalPnL,
      marginUsed: 500,
      positions: mockPositions
    };
  }

  // Real API Fetch Logic
  // This assumes standard TradeLocker API endpoints structure
  try {
    const accResponse = await fetch(`${server}/trade/accounts`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    // NOTE: This part is highly dependent on the specific TradeLocker API version/endpoint
    // For this prototype, we will return a safe fallback if the fetch fails due to CORS/Auth
    if (!accResponse.ok) throw new Error("Failed to fetch account info");
    
    // const accData = await accResponse.json();
    // Map real data here...
    
    return {
      isConnected: true,
      balance: 0,
      equity: 0,
      marginUsed: 0,
      positions: []
    };
  } catch (e) {
    console.warn("Using fallback data due to API error", e);
    // Return empty connected state on error to prevent crashing
    return {
      isConnected: true,
      balance: 0,
      equity: 0,
      marginUsed: 0,
      positions: []
    };
  }
};
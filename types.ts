export enum AnalystPersona {
  QUANT_BOT = 'QuantBot',
  TREND_MASTER = 'TrendMaster AI',
  PATTERN_GPT = 'ChartPattern_GPT',
  USER = 'User'
}

export interface ChatMessage {
  id: string;
  sender: AnalystPersona | string;
  text: string;
  timestamp: Date;
  isUser: boolean;
  attachment?: string; // Base64 string of the image
}

export interface ChartDataPoint {
  time: string;
  value: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface ChartConfig {
  id: string;
  symbol: string;
  color: string;
  data: ChartDataPoint[];
}

// --- TradeLocker / Broker Types ---

export interface TradeLockerCredentials {
  server: string; // e.g. 'demo.tradelocker.com'
  email: string;
  password: string;
  isDemo?: boolean;
}

export interface BrokerPosition {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  size: number; // Lots
  entryPrice: number;
  currentPrice: number;
  pnl: number;
}

export interface BrokerAccountInfo {
  isConnected: boolean;
  balance: number;
  equity: number;
  marginUsed: number;
  positions: BrokerPosition[];
}
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

/**
 * TradeLocker login credentials.
 * "server" is the TradeLocker server name (e.g. "EightCap-Demo"),
 * not a URL.
 */
export interface TradeLockerCredentials {
  server: string;
  email: string;
  password: string;
  isDemo?: boolean; // true = demo.tradelocker.com, false = live.tradelocker.com
}

export interface TradeLockerAccountSummary {
  id: string;
  accNum: number;
  name: string;
  currency: string;
  balance: number;
  isDemo: boolean;
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

// --- High-level AI Session Summary (Preserved) ---

export interface LanePlan {
  bias: string;
  entryPlan: string;
  invalidation: string;
  targets: string;
  rr: string;
}

export interface SessionSummary {
  headlineBias: string;
  keyLevels?: string;
  scalpPlan: LanePlan;
  swingPlan: LanePlan;
  riskNotes?: string;
}

// --- Journaling Types ---

export type TradeBias = 'Bullish' | 'Bearish' | 'Neutral';

export type TradeEntryType = 'Pre-Trade' | 'Post-Trade' | 'SessionReview';

export type TradeOutcome = 'Open' | 'Win' | 'Loss' | 'BreakEven';

export interface AccountSnapshot {
  balance: number;
  equity: number;
  openPnl: number;
  positionsCount: number;
}

export interface JournalEntry {
  id: string;
  timestamp: string; // ISO string
  focusSymbol: string;
  bias: TradeBias;
  confidence: number; // 1-5
  note: string;
  entryType: TradeEntryType;
  outcome: TradeOutcome;
  tags: string[];
  accountSnapshot?: AccountSnapshot | null;
}

export interface NewJournalEntryInput {
  focusSymbol: string;
  bias: TradeBias;
  confidence: number;
  note: string;
  entryType: TradeEntryType;
  outcome?: TradeOutcome;
  tags?: string[];
  accountSnapshot?: AccountSnapshot;
}

export interface JournalEntryPatch {
  outcome?: TradeOutcome;
  tags?: string[];
  note?: string;
}
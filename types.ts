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
  /**
   * TradeLocker "server" name from the login dialog (NOT a URL),
   * e.g. "EightCap-Demo" / "EightCap-Live" / your prop firm server name.
   */
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

// --- High-level AI Session Summary ---

export interface LanePlan {
  bias: string;        // Direction + timeframe context, e.g. "Bullish scalp while 4H still range-bound"
  entryPlan: string;   // Where/when to enter, in bullet-like text
  invalidation: string; // Where the idea is wrong / stop logic
  targets: string;     // TP ideas / partials
  rr: string;          // Explicit R:R style, e.g. "Aim for 2R–3R"
}

export interface SessionSummary {
  headlineBias: string;  // Overall one-liner bias for the session
  keyLevels?: string;    // Text description of key levels / zones
  scalpPlan: LanePlan;   // Playbook for fast trades
  swingPlan: LanePlan;   // Playbook for slower / HTF trades
  riskNotes?: string;    // News / volatility / risk comments
}

// --- Journaling Types ---

export type TradeBias = 'Bullish' | 'Bearish' | 'Neutral';

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
  accountSnapshot?: AccountSnapshot | null;
}

export interface NewJournalEntryInput {
  focusSymbol: string;
  bias: TradeBias;
  confidence: number;
  note: string;
  accountSnapshot?: AccountSnapshot;
}
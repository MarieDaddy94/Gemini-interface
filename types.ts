

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
  server: string;
  email: string;
  password: string;
  isDemo?: boolean; 
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

export type JournalSource = 'user' | 'ai' | 'broker';
export type TradeDirection = 'long' | 'short';

export interface AccountSnapshot {
  balance: number;
  equity: number;
  openPnl: number;
  positionsCount: number;
}

// Strict Trading Journal Entry
export interface JournalEntry {
  id: string;
  timestamp: string;         // ISO datetime

  // Structured Trading Data
  symbol?: string;           // "US30", "NAS100", "XAUUSD"
  direction?: TradeDirection;
  timeframe?: string;        // "1m", "5m", "15m", "1h"
  session?: string;          // "London", "NY", "Asia"

  entryPrice?: number;
  stopPrice?: number;
  targetPrice?: number;
  exitPrice?: number;

  size?: number;             // lots
  netPnl?: number;           // in currency
  currency?: string;         // "USD"
  rMultiple?: number;        // PnL measured in R

  playbook?: string;         // Name of setup
  preTradePlan?: string;     // Plan
  postTradeNotes?: string;   // Review
  sentiment?: string;        // "A+", "B", "Tilt"

  tags?: string[];
  relatedTradeId?: string;
  source: JournalSource;
  raw?: any;

  // Agent metadata
  agentId?: string;
  agentName?: string;

  // Legacy fields (optional compatibility)
  focusSymbol?: string; 
  bias?: TradeBias | string; 
  confidence?: number; 
  note?: string; 
  entryType?: TradeEntryType | string; 
  outcome?: TradeOutcome | string;
  accountSnapshot?: AccountSnapshot;
  linkedPositionId?: string | null;
  linkedSymbol?: string | null;
  finalPnl?: number | null;
  closedAt?: string | null;
  sessionId?: string;
}

export interface NewJournalEntryInput {
  focusSymbol: string;
  bias: TradeBias;
  confidence: number; // 1–5
  note: string;
  entryType: TradeEntryType;
  outcome: TradeOutcome;
  tags: string[];
  accountSnapshot?: AccountSnapshot;
  linkedPositionId: string | null;
  linkedSymbol: string | null;
  finalPnl?: number | null;
  closedAt?: string | null; // ISO string
}

export type JournalEntryPatch = Partial<JournalEntry>;

export interface TagSummary {
  tag: string;
  total: number;
  wins: number;
  losses: number;
  breakEven: number;
  closedWithPnl: number;
  totalPnl: number;
}

export interface SymbolSummaryForTag {
  symbol: string;
  total: number;
  wins: number;
  losses: number;
  breakEven: number;
  closedWithPnl: number;
  totalPnl: number;
}

// --- NEW AI ROUTING TYPES ---

export type AiRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ClientMessage {
  id?: string;
  role: AiRole;
  content: string;
  name?: string;          
  toolCallId?: string;    
}

export interface VisionAttachment {
  type: 'chart-screenshot';
  mimeType: string;       
  dataBase64: string;     
}

export interface MarketContext {
  symbol?: string;        
  timeframe?: string;     
  brokerSessionId?: string;
  journalSessionId?: string;
}

export interface AiRouteRequest {
  agentId: string;            
  messages: ClientMessage[];  
  vision?: VisionAttachment | null;  
  marketContext?: MarketContext;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface AiRouteResponse {
  message: ClientMessage;
  toolCalls?: ToolCall[];
  metadata?: {
    sentiment?: 'bullish' | 'bearish' | 'neutral';
    convictionScore?: number;         
    suggestedTrade?: {
      direction: 'long' | 'short';
      entryZone?: { from: number; to: number };
      stopLoss?: number;
      tp1?: number;
      tp2?: number;
      rrEstimate?: number;
      confidence?: number;
    } | null;
    journalEntryId?: string | null;
    playbookVariantId?: string | null;
  };
}

export interface AgentConfig {
  id: string;
  label: string;
  description: string;
  avatar: string;
  color: string;
}
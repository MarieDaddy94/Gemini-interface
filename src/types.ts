
export enum AnalystPersona {
  QUANT_BOT = 'QuantBot',
  TREND_MASTER = 'TrendMaster AI',
  PATTERN_GPT = 'ChartPattern_GPT',
  USER = 'User'
}

export interface TradeMeta {
  symbol?: string;
  timeframe?: string;
  direction?: 'long' | 'short';
  rr?: number;
  entryComment?: string;
  stopLoss?: number;
  takeProfit1?: number;
  takeProfit2?: number;
  confidence?: number; // 0–100
}

export interface ChatMessage {
  id: string;
  sender: AnalystPersona | string;
  text: string;
  timestamp: Date;
  isUser: boolean;
  attachment?: string; // Base64 string of the image
  
  // Agent-only fields:
  agentId?: string;
  agentName?: string;
  tradeMeta?: TradeMeta;
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

export interface MarketTick {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  rsi?: number;
  sma?: number;
  timestamp: string;
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
  openTime?: string;
}

export type BrokerEventType = 'ORDER_FILLED' | 'POSITION_CLOSED' | 'BALANCE_UPDATE';

export interface BrokerEvent {
  type: BrokerEventType;
  timestamp: string;
  data: {
    id: string;
    symbol: string;
    pnl?: number;
    side?: string;
    reason?: string;
    size?: number;
    entryPrice?: number;
    exitPrice?: number;
  };
}

export interface BrokerAccountInfo {
  isConnected: boolean;
  balance: number;
  equity: number;
  marginUsed: number;
  positions: BrokerPosition[];
  // New field for event-driven updates from polling
  recentEvents?: BrokerEvent[];
}

export interface TradeOrderRequest {
  sessionId: string;
  symbol: string;
  side: 'buy' | 'sell';
  size: number;
  stopLoss?: number;
  takeProfit?: number;
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

// --- Playbook Types (Phase M) ---

export type PlaybookTier = "A" | "B" | "C" | "experimental";
export type PlaybookKind = "scalp" | "intraday" | "swing" | "news" | "other";
export type PlaybookTrigger = "liquidity_sweep" | "breakout_retest" | "trend_continuation" | "mean_reversion" | "session_open_drive" | "custom";

export interface PlaybookStats {
  trades: number;
  wins: number;
  losses: number;
  avgR: number;
  maxDrawdownR: number;
  lastUsedAt?: string;
}

export interface Playbook {
  id: string;
  name: string;
  symbol: string;         // e.g. "US30", "NAS100"
  timeframe: string;      // "1m", "5m", etc.
  kind: PlaybookKind;
  tier: PlaybookTier;
  trigger: PlaybookTrigger;
  riskTemplate: {
    baseRiskR: number;    // e.g. 0.5R per trade
    maxStackedTrades?: number;
    dailyStopR?: number;
  };
  rulesText: string;      // human-readable rules
  llmPrompt?: string;     // compact version agents use
  tags: string[];         // e.g. ["NYO", "liquidity", "reversal"]
  exampleSnapshotIds: string[];   // link to vision_snapshots
  performance: PlaybookStats;
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
}

// Phase N: Active Desk Playbooks
export interface ActivePlaybook {
  playbookId: string;
  name: string;
  role: "primary" | "secondary" | "experimental";
  riskCapR: number; // Max R allowed for this playbook today
  usedR: number;    // Current R spent/risked
}

// --- Phase O: Session Gameplan & Debrief ---

export interface SessionGameplan {
  sessionId: string;
  date: string;
  marketSession: string; // "NY", "London", etc.
  highLevelGoal: string;
  lockdownTriggerR: number;
  activePlaybooks: ActivePlaybook[];
  focusNotes: string;
  riskPolicySnapshot?: DeskPolicy;
}

export interface SessionDebrief {
  goalMet: boolean;
  narrative: string;
  bestTradeId: string | null;
  improvements: string[];
  scorecard: {
    totalR: number;
    totalPnl: number;
    winRate: number;
    tradeCount: number;
  };
}

export interface DeskSession {
  id: string;
  date: string;
  startTime: string;
  endTime: string | null;
  summary: string;
  tags: string;
  stats: {
    totalR: number;
    totalPnl: number;
    tradeCount: number;
  };
  gameplan: SessionGameplan | null;
  debrief: SessionDebrief | null;
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

// NEW: Model Metadata for Analytics
export interface ModelMeta {
  provider: 'gemini' | 'openai' | 'anthropic' | 'other';
  model: string;
  role?: string; // which agent role (strategist, etc.)
  latencyMs?: number;
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
  playbookId?: string;       // Link to Playbook object (Phase M)
  
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
  
  // Model Experimentation Data
  modelMeta?: ModelMeta;

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
  rr?: number | null;
  pnl?: number | null;
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

// --- Playbook Review Types ---

export type PlayDirection = 'long' | 'short';

export interface PlaybookLesson {
  id: string;
  playbook: string;
  note: string;
  outcome: string;         // 'Win' | 'Loss' | 'BreakEven' | 'Open' | etc.
  symbol: string;
  direction?: PlayDirection;
}

export type PlaybookReviewPayload = {
  mode: 'lessons';
  entries: PlaybookLesson[];
};

export interface AgentJournalDraft {
  title: string;         // e.g. "US30 NY Reversal Fade"
  summary: string;       // 3–6 sentence explanation / lesson
  tags: string[];        // ["LondonOpen", "US30", "trendPullback"]
  sentiment: string;     // "Bullish" | "Bearish" | "Neutral"
  agentId: string;       // e.g. "agent-quant" | "agent-trend" | "agent-pattern"
  agentName: string;     // "QuantBot", "TrendMaster AI", "ChartPattern_GPT"
}

export interface AnalystHistoryItem {
  speaker: string;       // "You", "QuantBot", etc.
  text: string;
  isUser: boolean;
}

// ===============================
// Trading Session & Agent Types
// ===============================

export type AutopilotMode = 'off' | 'advisor' | 'semi' | 'full' | 'confirm' | 'auto'; // Added confirm/auto for new execution panel

export type TradingEnvironment = 'sim' | 'live';

export interface TradingInstrument {
  symbol: string;          // e.g. "US30", "NAS100", "XAUUSD"
  displayName: string;     // e.g. "US30 (Dow Jones)"
  brokerSymbol?: string;   // e.g. "US30.r" or "U30USD" for FunderPro/TradeLocker
}

export interface TimeframeState {
  currentTimeframe: string;    // e.g. "1m", "5m", "15m", "1h"
  higherTimeframes: string[];  // e.g. ["15m", "1h", "4h", "1D"]
}

export interface AccountState {
  accountId?: string;         // broker account identifier when connected
  accountName?: string;       // human readable label
  equity?: number;            // current equity if known
  balance?: number;           // current balance if known
  currency?: string;          // e.g. "USD"
  isFundedAccount: boolean;   // true for 100K / 200K prop, false for personal/demo
  fundedSize?: number;        // e.g. 200000 for a 200K account
}

export type AgentRole =
  | 'strategist'
  | 'risk'
  | 'quant'
  | 'execution'
  | 'journal';

export interface AgentDefinition {
  id: string;           // stable ID, e.g. "strategist-main"
  name: string;         // display name, e.g. "Strategist"
  role: AgentRole;
  description: string;  // short description for UI
  modelHint?: string;   // e.g. "gpt-5.1", "gemini-1.5-pro", "gemini-vision"
  isEnabled: boolean;
}

export type AgentMessageSender = 'user' | 'agent';

export interface AgentMessage {
  id: string;
  agentId?: string;           // which agent produced this, if any
  sender: AgentMessageSender;
  content: string;
  createdAt: string;          // ISO timestamp
  metadata?: Record<string, unknown>;
}

// --- Risk & Autopilot Types (Phase 4 + L) ---

export interface RiskConfig {
  maxRiskPerTradePercent: number;   // e.g. 0.5 = 0.5% of equity per trade
  maxDailyLossPercent: number;      // e.g. 3 = 3% daily DD cap
  maxWeeklyLossPercent: number;     // e.g. 8 = 8% weekly DD cap
  maxTradesPerDay: number;          // hard cap on number of trades per day
}

export interface RiskRuntimeState {
  tradesTakenToday: number;
  realizedPnlTodayPercent: number;  // realized PnL (Rough %) for today, e.g. -1.2
  realizedPnlWeekPercent: number;   // realized PnL (Rough %) for the week
}

export interface AutopilotConfig {
  allowFullAutoInLive: boolean;            // whether full auto is allowed on live/funded
  requireVoiceConfirmForFullAuto: boolean; // require voice confirmation for full auto entries
}

export interface ProposedTrade {
  id?: string;
  instrument: TradingInstrument;
  direction: TradeDirection;
  riskPercent: number;   // % of equity this trade risks if it stops out
  comment?: string;      // free-text notes from the agent/user
}

export interface RiskCheckResult {
  allowed: boolean;
  reasons: string[];              // hard reasons why it’s blocked
  warnings: string[];             // soft warnings
  projectedDailyLossPercent: number;
  projectedWeeklyLossPercent: number;
}

export interface TradingSessionState {
  // Core session info
  environment: TradingEnvironment;
  autopilotMode: AutopilotMode;

  // Instrument & timeframe
  instrument: TradingInstrument;
  timeframe: TimeframeState;

  // Account context
  account: AccountState;

  // Agent roster & conversation
  agents: AgentDefinition[];
  messages: AgentMessage[];

  // Risk & autopilot
  riskConfig: RiskConfig;
  riskRuntime: RiskRuntimeState;
  autopilotConfig: AutopilotConfig;

  // Flags
  isBrokerConnected: boolean;
  isNewsHighImpactNow: boolean;
  isVisionActive: boolean;
}

// ----- Broker / Sim account types -----

export type OrderSide = 'buy' | 'sell';

export interface SimPosition {
  id: string;
  instrumentSymbol: string;
  direction: TradeDirection;
  side: OrderSide;
  sizeUnits: number;
  entryPrice: number;
  stopPrice?: number;
  openedAt: string;
  closedAt?: string;
  closePrice?: number;
  pnl?: number;
  status: 'open' | 'closed';
}

export interface SimAccountInfo {
  accountId: string;
  accountName: string;
  equity: number;
  balance: number;
  currency: string;
}

// ----- Autopilot journal types -----

export type AutopilotExecutionStatus =
  | 'not_executed'
  | 'executed'
  | 'cancelled';

export interface AutopilotJournalEntry {
  id: string;
  createdAt: string;

  instrumentSymbol: string;
  direction: TradeDirection;
  riskPercent: number;

  environment: TradingEnvironment;
  autopilotMode: AutopilotMode;

  planSummary: string;
  allowed: boolean;
  recommended: boolean;

  riskReasons: string[];
  riskWarnings: string[];

  source: 'risk-panel' | 'voice' | 'chat' | 'other';

  executionStatus: AutopilotExecutionStatus;
  executionPrice?: number;
  closePrice?: number;
  pnl?: number;
}

// ----- Market data / snapshot types -----

export interface OhlcCandle {
  time: number;      // Unix ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface MarketSnapshot {
  symbol: string;
  primaryTimeframe: string;
  lastPrice: number;

  m1?: OhlcCandle[];
  m5?: OhlcCandle[];
  m15?: OhlcCandle[];
  h1?: OhlcCandle[];
  h4?: OhlcCandle[];
  d1?: OhlcCandle[];

  trendSummary?: string;
  volatilitySummary?: string;
}

// -----------------------------------------
// Autopilot / Execution Types
// -----------------------------------------

export type TradeCommandType = 'open' | 'close' | 'modify';

export interface OpenTradeCommand {
  type: 'open';
  tradableInstrumentId: number;
  symbol?: string;
  side: 'BUY' | 'SELL' | 'BOTH';
  qty: number;
  entryType: 'market' | 'limit' | 'stop';
  price?: number;      // entry price (limit/market approx)
  stopPrice?: number;  // for stop orders
  slPrice?: number;
  tpPrice?: number;
  routeId?: number | string;
  clientOrderId?: string;
}

export interface CloseTradeCommand {
  type: 'close';
  positionId: string | number;
  qty?: number; // 0 or omitted = full close
}

export interface ModifyTradeCommand {
  type: 'modify';
  positionId: string | number;
  slPrice?: number | null;
  tpPrice?: number | null;
}

export type AutopilotCommand =
  | OpenTradeCommand
  | CloseTradeCommand
  | ModifyTradeCommand;

export interface SnapshotPosition {
  id: string;
  instrumentId: number | null;
  symbol: string | null;
  side: string; // "LONG"/"SHORT"
  size: number;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  unrealizedPnl: number;
  raw?: any;
}

export interface BrokerSnapshot {
  broker: string;
  accountId: string;
  currency: string;
  balance: number;
  equity: number;
  marginUsed: number;
  marginAvailable: number;
  marginLevel: number | null;
  dailyPnl: number;
  dailyDrawdown: number;
  netUnrealizedPnl: number;
  openRisk: number;
  openPositions: SnapshotPosition[];
  rawState?: any;
  updatedAt: string;
}

export interface AutopilotExecuteResult {
  mode: AutopilotMode;
  source: string;
  executed: boolean;
  requiresConfirmation: boolean;
  allowedByGuard: boolean;
  hardBlocked: boolean;
  reasons: string[];
  warnings: string[];
  guardMetrics: Record<string, any>;
  brokerSnapshot: BrokerSnapshot | null;
  brokerResult: any;
}

export interface AutopilotExecuteResponse {
  ok: boolean;
  mode: AutopilotMode;
  result: AutopilotExecuteResult;
}

// -----------------------------------------
// Autopilot / Risk Verdict
// -----------------------------------------

export type RiskVerdict = 'ALLOW' | 'ALLOW_WITH_CAUTION' | 'BLOCK' | 'UNKNOWN';

// ===============================
// Vision / Multimodal Types
// ===============================

export type VisionProvider = 'auto' | 'gemini' | 'openai';

export type VisionMode = 'fast' | 'deep';

export type VisionTask =
  | 'chart_single'
  | 'chart_mtf'
  | 'live_watch'
  | 'journal'
  | 'chart_vision_v1';

// Basic vision settings for the current session
export interface VisionSettings {
  provider: VisionProvider;
  mode: VisionMode;
  defaultGeminiModel?: string;
  defaultOpenAIModel?: string;
}

// A single chart frame (e.g., 1m, 15m, 1h) used as vision input
export interface VisionFrameContext {
  timeframe: string; // "1m" | "15m" | "1h" | "4h" etc.
  description?: string; // optional note like "main execution chart"
}

// High-level context sent alongside images to the vision models
export interface VisionContext {
  task: VisionTask;
  instrument?: string;       // e.g. "US30", "NAS100", "XAUUSD"
  sessionContext?: string;   // e.g. "NY Open", "London", etc.
  frames?: VisionFrameContext[];
  // optional serialized broker state as JSON string
  brokerSnapshotJson?: string;
  // what the user actually asked ("Should I long here?" etc.)
  userQuestion?: string;
  // optional hint like "NY Reversal Fade", "Liquidity Sweep"
  playbookHint?: string;
}

// Output objects we'll later populate in steps 2–3
export type VisionBias = 'bullish' | 'bearish' | 'range' | 'unclear';

export type VisionZoneType =
  | 'demand'
  | 'supply'
  | 'liquidity_high'
  | 'liquidity_low'
  | 'fvg'
  | 'range_high'
  | 'range_low';

export interface VisionZone {
  id: string;
  type: VisionZoneType;
  timeframe?: string;
  price?: number;
  priceMin?: number;
  priceMax?: number;
  confidence?: number; // 0–1
  note?: string;
}

export interface VisionPattern {
  id: string;
  name: string; // e.g. "Liquidity sweep of PDH"
  timeframe?: string;
  description?: string;
  confidence?: number; // 0–1
}

// High-level “what did Pattern GPT see on the chart?”
export interface ChartVisionAnalysis {
  symbol: string;
  timeframe: string;
  sessionContext?: string;

  marketBias: 'bullish' | 'bearish' | 'choppy' | 'unclear';
  confidence: number; // 0–1

  structureNotes: string;        // trend, HH/HL vs LH/LL, ranges
  liquidityNotes: string;        // equal highs/lows, obvious stops, sweep risk
  fvgNotes: string;              // fair value gaps / imbalances
  keyZones: string[];            // “NY session high”, “London low”, etc.
  patternNotes: string;          // classic patterns, internal structure
  riskWarnings: string[];        // “extended move, late long”, “news nearby”
  suggestedPlaybookTags: string[]; // e.g. ["PDH sweep", "NY reversal"]

  // --- Multi-timeframe extensions (optional) ---
  htfBias?: 'bullish' | 'bearish' | 'choppy' | 'unclear';
  ltfBias?: 'bullish' | 'bearish' | 'choppy' | 'unclear';
  alignmentScore?: number; // 0–1: how well LTF aligns with HTF idea

  notesByTimeframe?: {
    timeframe: string;
    notes: string;
  }[];
}

// Structured Vision Snapshot (Phase H)
export interface VisionSnapshot {
  id: string;
  createdAt: string;
  symbol: string;
  timeframe: string;
  source: 'manual' | 'desk' | 'autopilot';
  textSummary: string;
  regime: 'trending' | 'ranging' | 'choppy' | 'unknown';
  bias: 'bullish' | 'bearish' | 'neutral' | 'mixed';
  volatility: 'low' | 'medium' | 'high';
  structureTags: string[];
  levels: Array<{ type: string; price: number; strength: string }>;
  playbookHints: Array<{ playbook: string; matchScore: number }>;
  
  // Model Lab
  provider?: string;
  model?: string;
}

// Normalized result format for any provider
export interface VisionResult {
  provider?: VisionProvider;
  modelId?: string;
  task?: VisionTask;
  createdAt?: string;

  htfBias?: VisionBias;
  structureSummary?: string;

  zones?: VisionZone[];
  patterns?: VisionPattern[];

  alignmentScore?: number; // for multi-TF cases

  riskNotes?: string[];

  // Raw text from the model, for logging / UI
  rawText?: string;
  summary?: string;
  analysis?: ChartVisionAnalysis;
  
  // Phase H: Fully structured snapshot
  snapshot?: VisionSnapshot;

  // For live watch specifically
  plan?: LiveWatchPlan;
  liveAnalysis?: LiveWatchAnalysis;
}

// --- Live Watch Types ---

export type LiveWatchStatus =
  | 'not_reached'
  | 'just_touched'
  | 'in_play'
  | 'invalidated'
  | 'tp_hit'
  | 'sl_hit';

export interface LiveWatchPlan {
  direction: 'long' | 'short';
  entryPrice?: number;
  entryZoneLow?: number;
  entryZoneHigh?: number;
  stopLossPrice: number;
  takeProfitPrice?: number;
  symbol: string;
  timeframe: string;
}

export interface LiveWatchAnalysis {
  status: LiveWatchStatus;
  comment: string;
  autopilotHint?: string;
}

export interface LiveWatchResult {
  rawText: string;
  plan: LiveWatchPlan;
  analysis: LiveWatchAnalysis;
}

// ===============================
// Journal / UI Vision
// ===============================

export interface JournalVisionAnalysis {
  source: 'broker_history' | 'performance_dashboard' | 'stats_page' | 'other';

  // Extracted stats (if visible in screenshot)
  approxWinRate?: number;        // 0–1
  approxRR?: number;             // average R-multiple if visible
  approxDrawdown?: number;       // 0–1, fraction of peak
  totalTradesText?: string;      // "121 trades last 30 days"
  bestDayText?: string;          // "Best day +$540 on 2025-11-20"
  worstDayText?: string;         // "Worst day -$400 on 2025-11-18"

  strengths: string[];           // bullet points: "You cut losses quickly", etc.
  weaknesses: string[];          // bullet points: "Overtrade after 2 losses", etc.
  behaviorPatterns: string[];    // "You size up after big wins", etc.

  sessionInsights: string[];     // per-session notes, if visible (London vs NY)
  instrumentInsights: string[];  // if screenshot shows per-symbol stats

  coachingNotes: string;         // 2–4 sentences as if Journal Coach is talking directly to the trader.
}

export interface JournalVisionResult {
  rawText: string;
  summary: string;
  analysis: JournalVisionAnalysis;
}

// ===============================
// Desk Policy Types (Phase J)
// ===============================

export type PolicyMode = 'advisory' | 'enforced';

export interface DeskPolicy {
  id: string;
  createdAt: string;
  date: string;
  mode: PolicyMode;
  maxRiskPerTrade: number; // e.g. 0.5 for 0.5%
  maxDailyLossR: number; // e.g. -3
  maxTradesPerDay: number;
  allowedPlaybooks: string[]; // e.g. ["London Breakout", "NY Reversal"]
  notes: string;
  
  // Stats driving this policy (optional context)
  contextStats?: {
    winRate: number;
    avgR: number;
    bestPlaybook: string;
  };
}

// ===============================
// Phase L: Tilt & Defense
// ===============================

export type RiskState = 'normal' | 'warming' | 'hot' | 'tilt_risk' | 'lockdown';

export type DefenseMode =
  | 'normal'
  | 'caution'     // smaller size, stricter filters
  | 'defense'     // no new risk, scale-outs only
  | 'lockdown';   // flat + no new trades

export interface TiltSignal {
  timestamp: string;
  reason:
    | 'rapid_losses'
    | 'oversized_trades'
    | 'rule_break'
    | 'overtrading'
    | 'big_win_euphoria'
    | 'session_dd_hit';
  details?: string;
}

export interface TiltState {
  riskState: RiskState;
  defenseMode: DefenseMode;
  tiltSignals: TiltSignal[];
  lastUpdate: string;
}

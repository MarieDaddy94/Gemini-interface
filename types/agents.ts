
export type AgentId = 'quant_bot' | 'trend_master' | 'pattern_gpt' | 'journal_coach';

export interface AgentJournalDraft {
  title: string;
  summary: string;
  tags: string[];
  sentiment?: 'Bullish' | 'Bearish' | 'Neutral';
  agentId: AgentId;
  agentName: string;
  direction?: 'long' | 'short';
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'agent';
  agentId?: AgentId;
  agentName?: string;
  content: string;
  createdAt: string;
  journalDraft?: AgentJournalDraft;
}

export interface AgentTurnContext {
  symbol?: string | null;
  timeframe?: string | null;
  mode?: 'live' | 'post_trade';
  brokerSnapshot?: any;
  journalSummary?: string;
}

export interface AgentDefinition {
  id: AgentId;
  name: string;
  shortLabel: string;
  description: string;
}

export const AGENT_DEFINITIONS: AgentDefinition[] = [
  {
    id: 'quant_bot',
    name: 'QuantBot',
    shortLabel: 'Q',
    description:
      'Statistical edge hunter. Focus on R:R, win-rate, regime filters, and backtest-style reasoning.'
  },
  {
    id: 'trend_master',
    name: 'TrendMaster',
    shortLabel: 'T',
    description:
      'Market structure and trend specialist. Focus on HTF bias, liquidity sweeps, and continuation vs reversal.'
  },
  {
    id: 'pattern_gpt',
    name: 'PatternGPT',
    shortLabel: 'P',
    description:
      'Pattern and candle flow analyst. Spots recurring setups, engulfings, FVGs, VWAP interactions, etc.'
  },
  {
    id: 'journal_coach',
    name: 'Journal Coach',
    shortLabel: 'J',
    description:
      'Post-trade reviewer. Turns lessons into structured journal entries and playbooks.'
  }
];

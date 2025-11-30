import React, { useEffect, useMemo, useState } from 'react';
import {
  BrokerAccountInfo,
  JournalEntry,
  NewJournalEntryInput,
  TradeBias,
  TradeEntryType,
  TradeOutcome,
} from '../types';
import {
  fetchJournalEntries,
  createJournalEntry,
} from '../services/journalService';

interface JournalPanelProps {
  sessionId: string;
  brokerData: BrokerAccountInfo | null;
}

const BIASES: TradeBias[] = ['Bullish', 'Bearish', 'Neutral'];
const ENTRY_TYPES: TradeEntryType[] = ['Pre-Trade', 'Post-Trade', 'SessionReview'];
const OUTCOMES: TradeOutcome[] = ['Open', 'Win', 'Loss', 'BreakEven'];

const JournalPanel: React.FC<JournalPanelProps> = ({ sessionId, brokerData }) => {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);

  // Form state
  const [symbol, setSymbol] = useState('');
  const [bias, setBias] = useState<TradeBias>('Neutral');
  const [confidence, setConfidence] = useState<number>(3);
  const [entryType, setEntryType] = useState<TradeEntryType>('Pre-Trade');
  const [outcome, setOutcome] = useState<TradeOutcome>('Open');
  const [tagsInput, setTagsInput] = useState('');
  const [note, setNote] = useState('');
  const [linkedPositionId, setLinkedPositionId] = useState<string>('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters for RECENT ENTRIES
  const [symbolFilter, setSymbolFilter] = useState<string>('All');
  const [outcomeFilter, setOutcomeFilter] = useState<'All' | TradeOutcome>('All');
  const [onlyLosers, setOnlyLosers] = useState(false);

  const openPositions = brokerData?.positions ?? [];

  useEffect(() => {
    if (!symbol && openPositions.length > 0) {
      setSymbol(openPositions[0].symbol);
      setLinkedPositionId(openPositions[0].id);
    }
  }, [openPositions, symbol]);

  const loadEntries = async () => {
    setLoadingEntries(true);
    try {
      const data = await fetchJournalEntries(sessionId);
      setEntries(data);
    } catch (e) {
      console.error('Failed to load journal entries', e);
    } finally {
      setLoadingEntries(false);
    }
  };

  useEffect(() => {
    loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!symbol.trim()) {
      setError('Symbol is required.');
      return;
    }

    const tags = tagsInput
      .split(/[,\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    const linkedPos =
      linkedPositionId && openPositions.length
        ? openPositions.find((p) => p.id === linkedPositionId)
        : undefined;

    const accountSnapshot =
      brokerData && brokerData.isConnected
        ? {
            balance: brokerData.balance,
            equity: brokerData.equity,
            openPnl: brokerData.equity - brokerData.balance,
            positionsCount: brokerData.positions.length,
          }
        : undefined;

    const payload: NewJournalEntryInput = {
      focusSymbol: symbol.trim(),
      bias,
      confidence: Math.min(5, Math.max(1, Number(confidence) || 1)),
      note: note.trim(),
      entryType,
      outcome,
      tags,
      accountSnapshot,
      linkedPositionId: linkedPositionId || null,
      linkedSymbol: linkedPos ? linkedPos.symbol : null,
      finalPnl: null,
      closedAt: null,
    };

    setSaving(true);
    try {
      await createJournalEntry(sessionId, payload);
      setNote('');
      setTagsInput('');
      setOutcome(entryType === 'Pre-Trade' ? 'Open' : outcome);
      await loadEntries();
    } catch (err: any) {
      console.error('Failed to save journal entry', err);
      setError(err.message || 'Failed to save entry.');
    } finally {
      setSaving(false);
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const uniqueSymbols = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => {
      if (e.focusSymbol) set.add(e.focusSymbol);
    });
    return Array.from(set).sort();
  }, [entries]);

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (symbolFilter !== 'All' && e.focusSymbol !== symbolFilter) return false;
      if (outcomeFilter !== 'All' && e.outcome !== outcomeFilter) return false;
      if (onlyLosers && e.outcome !== 'Loss') return false;
      return true;
    });
  }, [entries, symbolFilter, outcomeFilter, onlyLosers]);

  const accountConnected = brokerData && brokerData.isConnected;

  return (
    <div className="bg-[#1e222d] border-t border-[#2a2e39] px-4 py-3 text-xs flex flex-col gap-2">
      {/* Header row: title + entries count */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wide text-gray-400">
            Trading Journal
          </span>
          <span className="px-1.5 py-0.5 rounded-full bg-[#2962ff]/10 text-[#2962ff] text-[9px] font-semibold border border-[#2962ff]/40">
            coach powered
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-gray-400">
          <span>
            Entries: <span className="text-gray-200">{entries.length}</span>
          </span>
        </div>
      </div>

      {/* Main content row: account snapshot + form */}
      <form
        onSubmit={handleSave}
        className="flex gap-4 items-stretch mt-1"
      >
        {/* ACCOUNT SNAPSHOT */}
        <div className="w-56 bg-[#131722] border border-[#2a2e39] rounded-md px-3 py-2 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-gray-400 uppercase tracking-wide">
                Account Snapshot
              </span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                  accountConnected
                    ? 'bg-[#089981]/10 text-[#089981] border-[#089981]/40'
                    : 'bg-gray-700/40 text-gray-300 border-gray-600'
                }`}
              >
                {accountConnected ? 'Connected' : 'Not Connected'}
              </span>
            </div>
            {accountConnected && brokerData ? (
              <div className="space-y-1 text-[11px] text-gray-200">
                <div className="flex justify-between">
                  <span>Balance</span>
                  <span className="font-semibold">
                    ${brokerData.balance.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Equity</span>
                  <span
                    className={
                      brokerData.equity >= brokerData.balance
                        ? 'text-[#089981] font-semibold'
                        : 'text-[#f23645] font-semibold'
                    }
                  >
                    ${brokerData.equity.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Open PnL</span>
                  <span
                    className={
                      brokerData.equity - brokerData.balance >= 0
                        ? 'text-[#089981]'
                        : 'text-[#f23645]'
                    }
                  >
                    ${(brokerData.equity - brokerData.balance).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Open Positions</span>
                  <span>{brokerData.positions.length}</span>
                </div>
              </div>
            ) : (
              <p className="text-[10px] text-gray-500 mt-1.5 leading-snug">
                Connect your TradeLocker account to snapshot live stats with each
                journal entry.
              </p>
            )}
          </div>
          <p className="mt-2 text-[9px] text-gray-500">
            Keep your tags consistent (e.g. <span className="font-mono">LondonOpen</span>,{' '}
            <span className="font-mono">NYReversal</span>) so chat can coach you with{' '}
            <span className="font-mono">/coach Tag Symbol</span>.
          </p>
        </div>

        {/* Form area */}
        <div className="flex-1 flex flex-col gap-2">
          {/* Symbol + bias + confidence + type + outcome + link trade */}
          <div className="flex flex-wrap gap-3 items-center">
            {/* Symbol */}
            <div className="flex flex-col gap-1">
              <span className="text-[9px] text-gray-400 uppercase">Symbol</span>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="bg-[#131722] border border-[#2a2e39] rounded px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-[#2962ff] min-w-[110px]"
                placeholder="US30 / XAUUSD / BTCUSD"
              />
            </div>

            {/* Bias pill group */}
            <div className="flex flex-col gap-1">
              <span className="text-[9px] text-gray-400 uppercase">Bias</span>
              <div className="flex bg-[#131722] rounded-full border border-[#2a2e39] overflow-hidden">
                {BIASES.map((b) => {
                  const active = b === bias;
                  return (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setBias(b)}
                      className={`px-3 py-1 text-[11px] font-medium transition-colors ${
                        active
                          ? 'bg-[#2962ff] text-white'
                          : 'text-gray-300 hover:bg-[#2a2e39]'
                      }`}
                    >
                      {b}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Confidence pills */}
            <div className="flex flex-col gap-1">
              <span className="text-[9px] text-gray-400 uppercase">
                Confidence
              </span>
              <div className="flex bg-[#131722] rounded-full border border-[#2a2e39] overflow-hidden">
                {[1, 2, 3, 4, 5].map((n) => {
                  const active = n === confidence;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setConfidence(n)}
                      className={`px-2 py-1 text-[11px] font-medium transition-colors ${
                        active
                          ? 'bg-white text-[#131722]'
                          : 'text-gray-300 hover:bg-[#2a2e39]'
                      }`}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Type pills */}
            <div className="flex flex-col gap-1">
              <span className="text-[9px] text-gray-400 uppercase">Type</span>
              <div className="flex bg-[#131722] rounded-full border border-[#2a2e39] overflow-hidden">
                {ENTRY_TYPES.map((t) => {
                  const label =
                    t === 'Pre-Trade'
                      ? 'Pre-Trade'
                      : t === 'Post-Trade'
                      ? 'Post-Trade'
                      : 'Session';
                  const active = t === entryType;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setEntryType(t);
                        if (t === 'Pre-Trade') setOutcome('Open');
                      }}
                      className={`px-3 py-1 text-[11px] font-medium transition-colors ${
                        active
                          ? 'bg-[#2962ff] text-white'
                          : 'text-gray-300 hover:bg-[#2a2e39]'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Outcome select */}
            <div className="flex flex-col gap-1">
              <span className="text-[9px] text-gray-400 uppercase">
                Outcome
              </span>
              <select
                value={outcome}
                onChange={(e) =>
                  setOutcome(e.target.value as TradeOutcome)
                }
                className="bg-[#131722] border border-[#2a2e39] rounded px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-[#2962ff] min-w-[90px]"
              >
                {OUTCOMES.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>

            {/* Link Trade */}
            <div className="flex flex-col gap-1 min-w-[160px]">
              <span className="text-[9px] text-gray-400 uppercase">
                Link Trade
              </span>
              <select
                value={linkedPositionId}
                onChange={(e) => setLinkedPositionId(e.target.value)}
                className="bg-[#131722] border border-[#2a2e39] rounded px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-[#2962ff]"
              >
                <option value="">None</option>
                {openPositions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.symbol} {p.side.toUpperCase()} {p.size} @ {p.entryPrice}{' '}
                    (PnL ${p.pnl})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Note + tags + save button */}
          <div className="flex items-end gap-2 mt-1">
            <div className="flex-1 flex flex-col gap-1">
              <span className="text-[9px] text-gray-400 uppercase">
                Note / Playbook reasoning
              </span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="w-full bg-[#131722] border border-[#2a2e39] rounded px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-[#2962ff] resize-none"
                placeholder="What are you seeing? Why this trade? What invalidates the idea?"
              />
            </div>

            <div className="w-56 flex flex-col gap-1">
              <span className="text-[9px] text-gray-400 uppercase">
                Tags (space or comma)
              </span>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                className="bg-[#131722] border border-[#2a2e39] rounded px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-[#2962ff]"
                placeholder="LondonOpen US30_M5 newsFade"
              />
              <button
                type="submit"
                disabled={saving}
                className="mt-1 px-3 py-1.5 rounded bg-[#2962ff] text-white text-[11px] font-semibold hover:bg-[#1e53e5] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
              >
                {saving && (
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                <span>Save Journal Entry</span>
              </button>
            </div>
          </div>

          {error && (
            <div className="text-[10px] text-red-400 mt-1">
              {error}
            </div>
          )}
        </div>
      </form>

      {/* RECENT ENTRIES strip */}
      <div className="mt-2 flex items-start justify-between gap-4">
        <div className="flex items-center gap-2 text-[10px] text-gray-400">
          <span className="uppercase tracking-wide">Recent Entries</span>

          {/* Symbol filter */}
          <div className="flex items-center gap-1">
            <span>Symbol</span>
            <select
              value={symbolFilter}
              onChange={(e) => setSymbolFilter(e.target.value)}
              className="bg-[#131722] border border-[#2a2e39] rounded px-2 py-0.5 text-[10px] text-gray-200 focus:outline-none focus:border-[#2962ff]"
            >
              <option value="All">All</option>
              {uniqueSymbols.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Outcome filter */}
          <div className="flex items-center gap-1">
            <span>Outcome</span>
            <div className="flex bg-[#131722] rounded-full border border-[#2a2e39] overflow-hidden">
              {['All', 'Open', 'Win', 'Loss', 'BreakEven'].map((v) => {
                const active = outcomeFilter === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() =>
                      setOutcomeFilter(
                        v === 'All' ? 'All' : (v as TradeOutcome)
                      )
                    }
                    className={`px-2 py-0.5 text-[10px] transition-colors ${
                      active
                        ? 'bg-white text-[#131722]'
                        : 'text-gray-300 hover:bg-[#2a2e39]'
                    }`}
                  >
                    {v}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Only losers */}
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyLosers}
              onChange={(e) => setOnlyLosers(e.target.checked)}
              className="w-3 h-3 rounded bg-[#131722] border border-[#2a2e39] text-[#f23645]"
            />
            <span>Only losers</span>
          </label>
        </div>

        {/* Entries list */}
        <div className="flex-1 max-h-16 overflow-x-auto overflow-y-hidden flex gap-2 justify-end">
          {filteredEntries.slice(0, 10).map((e) => (
            <div
              key={e.id}
              className="bg-[#131722] border border-[#2a2e39] rounded px-2 py-1 text-[10px] text-gray-200 min-w-[170px]"
            >
              <div className="flex justify-between items-center mb-0.5">
                <span className="font-semibold text-white">
                  {e.focusSymbol}
                </span>
                <span
                  className={`px-1 py-[1px] rounded-full border ${
                    e.outcome === 'Win'
                      ? 'bg-[#089981]/10 text-[#089981] border-[#089981]/40'
                      : e.outcome === 'Loss'
                      ? 'bg-[#f23645]/10 text-[#f23645] border-[#f23645]/40'
                      : e.outcome === 'BreakEven'
                      ? 'bg-gray-500/10 text-gray-300 border-gray-500/40'
                      : 'bg-gray-700/40 text-gray-300 border-gray-600'
                  }`}
                >
                  {e.outcome}
                </span>
              </div>
              <div className="flex justify-between items-center text-[9px] text-gray-400 mb-0.5">
                <span>
                  {e.bias} · Conf {e.confidence}/5
                </span>
                <span>{formatTime(e.timestamp)}</span>
              </div>
              {e.tags && e.tags.length > 0 && (
                <div className="text-[9px] text-gray-400 truncate">
                  {e.tags.join(' ')}
                </div>
              )}
            </div>
          ))}
          {filteredEntries.length === 0 && !loadingEntries && (
            <div className="text-[10px] text-gray-500 self-center">
              No journal entries match your filters. Log a note or relax the filters.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default JournalPanel;
import React, { useEffect, useMemo, useState } from 'react';
import {
  BrokerAccountInfo,
  JournalEntry,
  NewJournalEntryInput,
  TradeBias,
  TradeEntryType,
  TradeOutcome
} from '../types';
import {
  createJournalEntry,
  fetchJournalEntries,
  updateJournalEntry
} from '../services/journalService';

interface JournalPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string | null;
  autoFocusSymbol: string | null;
  brokerData: BrokerAccountInfo | null;
}

const biasOptions: TradeBias[] = ['Bullish', 'Bearish', 'Neutral'];
const entryTypeOptions: TradeEntryType[] = [
  'Pre-Trade',
  'Post-Trade',
  'SessionReview'
];

const outcomeFilters: (TradeOutcome | 'All')[] = [
  'All',
  'Open',
  'Win',
  'Loss',
  'BreakEven'
];

interface TagStats {
  tag: string;
  total: number;
  wins: number;
  losses: number;
  breakEven: number;
  closedWithPnl: number;
  totalPnl: number;
}

interface TagSymbolStats {
  symbol: string;
  total: number;
  wins: number;
  losses: number;
  breakEven: number;
  closedWithPnl: number;
  totalPnl: number;
}

const JournalPanel: React.FC<JournalPanelProps> = ({
  isOpen,
  onClose,
  sessionId,
  autoFocusSymbol,
  brokerData
}) => {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [bias, setBias] = useState<TradeBias>('Bullish');
  const [confidence, setConfidence] = useState<number>(3);
  const [entryType, setEntryType] = useState<TradeEntryType>('Pre-Trade');
  const [note, setNote] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [activeSymbolFilter, setActiveSymbolFilter] = useState<string>('All');
  const [activeOutcomeFilter, setActiveOutcomeFilter] =
    useState<TradeOutcome | 'All'>('All');
  const [onlyLosers, setOnlyLosers] = useState<boolean>(false);

  // Position link for this note
  const [linkedPositionId, setLinkedPositionId] = useState<string>('');

  // Tag drill-down modal
  const [selectedTag, setSelectedTag] = useState<TagStats | null>(null);

  const openPnl =
    brokerData && brokerData.isConnected
      ? brokerData.equity - brokerData.balance
      : 0;

  // Load entries when panel opens or session changes
  useEffect(() => {
    const load = async () => {
      if (!isOpen || !sessionId) return;
      setLoadingEntries(true);
      setError(null);
      try {
        const data = await fetchJournalEntries(sessionId);
        setEntries(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load journal entries');
      } finally {
        setLoadingEntries(false);
      }
    };
    load();
  }, [isOpen, sessionId]);

  // If you clicked a symbol to open the journal, default to Pre-Trade
  useEffect(() => {
    if (autoFocusSymbol && autoFocusSymbol !== 'Auto') {
      setEntryType('Pre-Trade');
    }
  }, [autoFocusSymbol]);

  // If broker positions change and the linked position vanishes, clear the link for the *new note* form
  useEffect(() => {
    if (!brokerData || !brokerData.positions.length) {
      setLinkedPositionId('');
      return;
    }
    const exists = brokerData.positions.some(
      (p) => p.id === linkedPositionId
    );
    if (!exists) {
      setLinkedPositionId('');
    }
  }, [brokerData, linkedPositionId]);

  if (!isOpen) return null;

  const availablePositions = useMemo(() => {
    if (!brokerData || !brokerData.positions.length) return [];
    if (!autoFocusSymbol) return brokerData.positions;

    const primary = brokerData.positions.filter((p) =>
      p.symbol.toUpperCase().includes(autoFocusSymbol.toUpperCase())
    );
    const others = brokerData.positions.filter(
      (p) => !p.symbol.toUpperCase().includes(autoFocusSymbol.toUpperCase())
    );
    return [...primary, ...others];
  }, [brokerData, autoFocusSymbol]);

  const handleSave = async () => {
    if (!sessionId) {
      setError('Connect your broker to start journaling.');
      return;
    }
    if (!note.trim()) return;

    setSaving(true);
    setError(null);

    const snapshot =
      brokerData && brokerData.isConnected
        ? {
            balance: brokerData.balance,
            equity: brokerData.equity,
            openPnl,
            positionsCount: brokerData.positions.length
          }
        : undefined;

    const linkedPos =
      linkedPositionId && brokerData
        ? brokerData.positions.find((p) => p.id === linkedPositionId)
        : undefined;

    const payload: NewJournalEntryInput = {
      focusSymbol: autoFocusSymbol || 'Auto',
      bias,
      confidence,
      note: note.trim(),
      entryType,
      outcome: 'Open',
      tags,
      accountSnapshot: snapshot,
      linkedPositionId: linkedPos ? linkedPos.id : null,
      linkedSymbol: linkedPos ? linkedPos.symbol : null
    };

    try {
      const created = await createJournalEntry(sessionId, payload);
      setEntries((prev) => [created, ...prev]);
      setNote('');
      setTags([]);
      setTagInput('');
      setLinkedPositionId('');
    } catch (err: any) {
      setError(err.message || 'Failed to save journal entry');
    } finally {
      setSaving(false);
    }
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const raw = tagInput.trim();
      if (!raw) return;
      if (!tags.includes(raw)) {
        setTags((prev) => [...prev, raw]);
      }
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  };

  const handleSetOutcome = async (
    entry: JournalEntry,
    outcome: TradeOutcome
  ) => {
    if (!sessionId) return;
    try {
      const updated = await updateJournalEntry(sessionId, entry.id, {
        outcome
      });
      setEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? updated : e))
      );
    } catch (err) {
      console.error('Failed to update outcome', err);
    }
  };

  const symbolOptions = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => set.add(e.focusSymbol));
    return ['All', ...Array.from(set)];
  }, [entries]);

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (
        activeSymbolFilter !== 'All' &&
        e.focusSymbol !== activeSymbolFilter
      ) {
        return false;
      }
      if (activeOutcomeFilter !== 'All' && e.outcome !== activeOutcomeFilter) {
        return false;
      }
      if (onlyLosers && e.outcome !== 'Loss') {
        return false;
      }
      return true;
    });
  }, [entries, activeSymbolFilter, activeOutcomeFilter, onlyLosers]);

  // === TAG STATS: aggregate across *all* closed entries ===
  const tagStats: TagStats[] = useMemo(() => {
    const map = new Map<string, TagStats>();

    entries.forEach((e) => {
      if (!e.tags || e.tags.length === 0) return;
      if (e.outcome === 'Open') return; // only count closed decisions

      const pnl =
        typeof e.finalPnl === 'number' && !Number.isNaN(e.finalPnl)
          ? e.finalPnl
          : null;

      e.tags.forEach((rawTag) => {
        const tag = rawTag.trim();
        if (!tag) return;

        let s = map.get(tag);
        if (!s) {
          s = {
            tag,
            total: 0,
            wins: 0,
            losses: 0,
            breakEven: 0,
            closedWithPnl: 0,
            totalPnl: 0
          };
          map.set(tag, s);
        }

        s.total += 1;
        if (e.outcome === 'Win') s.wins += 1;
        else if (e.outcome === 'Loss') s.losses += 1;
        else if (e.outcome === 'BreakEven') s.breakEven += 1;

        if (pnl !== null) {
          s.closedWithPnl += 1;
          s.totalPnl += pnl;
        }
      });
    });

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [entries]);

  const overallStats = useMemo(() => {
    if (!tagStats.length) return null;

    let total = 0;
    let wins = 0;
    let losses = 0;
    let breakEven = 0;
    let closedWithPnl = 0;
    let totalPnl = 0;

    tagStats.forEach((s) => {
      total += s.total;
      wins += s.wins;
      losses += s.losses;
      breakEven += s.breakEven;
      closedWithPnl += s.closedWithPnl;
      totalPnl += s.totalPnl;
    });

    return {
      total,
      wins,
      losses,
      breakEven,
      closedWithPnl,
      totalPnl
    };
  }, [tagStats]);

  // Entries for the currently selected tag (for drill-down)
  const entriesForSelectedTag = useMemo(() => {
    if (!selectedTag) return [];
    return entries.filter(
      (e) => e.tags && e.tags.some((t) => t.trim() === selectedTag.tag)
    );
  }, [entries, selectedTag]);

  // Per-symbol stats for the selected tag (symbol × tag view)
  const perSymbolStatsForSelectedTag: TagSymbolStats[] = useMemo(() => {
    if (!selectedTag) return [];

    const map = new Map<string, TagSymbolStats>();

    entries.forEach((e) => {
      if (!e.tags || !e.tags.some((t) => t.trim() === selectedTag.tag)) return;
      if (!e.focusSymbol) return;

      const pnl =
        typeof e.finalPnl === 'number' && !Number.isNaN(e.finalPnl)
          ? e.finalPnl
          : null;

      let s = map.get(e.focusSymbol);
      if (!s) {
        s = {
          symbol: e.focusSymbol,
          total: 0,
          wins: 0,
          losses: 0,
          breakEven: 0,
          closedWithPnl: 0,
          totalPnl: 0
        };
        map.set(e.focusSymbol, s);
      }

      s.total += 1;
      if (e.outcome === 'Win') s.wins += 1;
      else if (e.outcome === 'Loss') s.losses += 1;
      else if (e.outcome === 'BreakEven') s.breakEven += 1;

      if (pnl !== null && e.outcome !== 'Open') {
        s.closedWithPnl += 1;
        s.totalPnl += pnl;
      }
    });

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [entries, selectedTag]);

  // Shared renderer for a journal entry card (used in main list + tag modal)
  const renderEntryCard = (e: JournalEntry) => {
    const date = new Date(e.timestamp);
    const openPnlAtNote =
      e.accountSnapshot?.openPnl ?? undefined;

    return (
      <div
        key={e.id}
        className="border border-[#2a2e39] rounded-lg bg-[#131722] px-3 py-2.5 text-xs"
      >
        <div className="flex justify-between items-center mb-1">
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded-full bg-[#1e222d] text-[10px] text-gray-300 border border-[#2a2e39]">
              {e.focusSymbol}
            </span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                e.bias === 'Bullish'
                  ? 'bg-[#089981]/10 text-[#089981] border-[#089981]/40'
                  : e.bias === 'Bearish'
                  ? 'bg-[#f23645]/10 text-[#f23645] border-[#f23645]/40'
                  : 'bg-gray-600/20 text-gray-200 border-gray-500/40'
              }`}
            >
              {e.bias}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#1e222d] text-gray-300 border border-[#2a2e39]">
              {e.entryType === 'SessionReview'
                ? 'Session'
                : e.entryType}
            </span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                e.outcome === 'Win'
                  ? 'bg-[#089981]/10 text-[#089981] border-[#089981]/40'
                  : e.outcome === 'Loss'
                  ? 'bg-[#f23645]/10 text-[#f23645] border-[#f23645]/40'
                  : e.outcome === 'BreakEven'
                  ? 'bg-gray-500/20 text-gray-200 border-gray-500/40'
                  : 'bg-blue-500/10 text-blue-300 border-blue-500/40'
              }`}
            >
              {e.outcome === 'Open' ? 'Open / Pre' : e.outcome}
            </span>
            {e.linkedPositionId && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#1e222d] text-blue-300 border border-blue-500/40">
                Linked:{' '}
                {e.linkedSymbol || 'Position'} •{' '}
                {e.linkedPositionId}
              </span>
            )}
          </div>
          <span className="text-[10px] text-gray-500">
            {date.toLocaleDateString()} •{' '}
            {date.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit'
            })}
          </span>
        </div>

        <p className="text-gray-200 mb-1 whitespace-pre-wrap">
          {e.note}
        </p>

        {e.tags && e.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1">
            {e.tags.map((t) => (
              <span
                key={t}
                className="px-1.5 py-0.5 rounded-full bg-[#1e222d] text-[10px] text-gray-300 border border-[#2a2e39]"
              >
                #{t}
              </span>
            ))}
          </div>
        )}

        {e.finalPnl != null && e.closedAt && (
          <div className="text-[10px] text-gray-400 mb-1">
            Trade closed:{' '}
            <span
              className={
                e.finalPnl < 0
                  ? 'text-[#f23645]'
                  : 'text-[#089981]'
              }
            >
              ${e.finalPnl.toFixed(2)}
            </span>{' '}
            @{' '}
            {new Date(e.closedAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit'
            })}
          </div>
        )}

        <div className="flex justify-between items-center text-[10px] text-gray-400 mt-1">
          <div className="flex items-center gap-2">
            <span>
              Conf:{' '}
              <span className="text-gray-100">
                {e.confidence}/5
              </span>
            </span>
            {e.entryType === 'Post-Trade' ||
            e.outcome !== 'Open' ? (
              <span className="text-gray-400">
                Outcome:{' '}
                <span
                  className={
                    e.outcome === 'Win'
                      ? 'text-[#089981]'
                      : e.outcome === 'Loss'
                      ? 'text-[#f23645]'
                      : 'text-gray-200'
                  }
                >
                  {e.outcome}
                </span>
              </span>
            ) : (
              <div className="flex items-center gap-1">
                <span>Mark outcome:</span>
                <button
                  type="button"
                  onClick={() =>
                    handleSetOutcome(e, 'Win')
                  }
                  className="px-1.5 py-0.5 rounded-full bg-[#089981]/10 text-[#089981] border border-[#089981]/40"
                >
                  Win
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleSetOutcome(e, 'Loss')
                  }
                  className="px-1.5 py-0.5 rounded-full bg-[#f23645]/10 text-[#f23645] border border-[#f23645]/40"
                >
                  Loss
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleSetOutcome(e, 'BreakEven')
                  }
                  className="px-1.5 py-0.5 rounded-full bg-gray-500/20 text-gray-200 border border-gray-500/40"
                >
                  BE
                </button>
              </div>
            )}
          </div>

          {e.accountSnapshot && (
            <span>
              PnL @ note:{' '}
              <span
                className={
                  openPnlAtNote && openPnlAtNote < 0
                    ? 'text-[#f23645]'
                    : 'text-[#089981]'
                }
              >
                ${e.accountSnapshot.openPnl.toFixed(2)}
              </span>
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="fixed bottom-4 left-4 right-[420px] max-h-[50vh] z-40">
        <div className="bg-[#1e222d]/95 backdrop-blur-md border border-[#2a2e39] rounded-xl shadow-2xl overflow-hidden flex flex-col h-full">
          {/* Header */}
          <div className="px-4 py-2 border-b border-[#2a2e39] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-[#2962ff] flex items-center justify-center text-xs font-bold text-white">
                J
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-white">
                  Trading Journal
                </span>
                <span className="text-[10px] text-gray-400">
                  Tag pre/post trades, link positions, auto-mark outcomes, and see pattern stats.
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {autoFocusSymbol && (
                <span className="px-2 py-0.5 rounded-full bg-[#131722] text-[10px] text-gray-300 border border-[#2a2e39]">
                  Focus:{' '}
                  <span className="font-semibold">
                    {autoFocusSymbol}
                  </span>
                </span>
              )}
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white p-1 rounded hover:bg-[#2a2e39] transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>

          {/* Top snapshot + form */}
          <div className="p-3 border-b border-[#2a2e39] flex flex-col md:flex-row md:items-stretch gap-3">
            {/* Account snapshot */}
            <div className="md:w-1/3 bg-[#131722] rounded-lg border border-[#2a2e39] p-3 flex flex-col justify-between">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[11px] text-gray-400 uppercase">
                  Account Snapshot
                </span>
                <span
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                    brokerData && brokerData.isConnected
                      ? 'bg-[#089981]/10 text-[#089981]'
                      : 'bg-gray-600/20 text-gray-300'
                  }`}
                >
                  {brokerData && brokerData.isConnected
                    ? 'Live'
                    : 'Not Connected'}
                </span>
              </div>
              {brokerData && brokerData.isConnected ? (
                <>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">Balance</span>
                    <span className="text-gray-100">
                      ${brokerData.balance.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">Equity</span>
                    <span
                      className={
                        openPnl >= 0 ? 'text-[#089981]' : 'text-[#f23645]'
                      }
                    >
                      ${brokerData.equity.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">Open PnL</span>
                    <span
                      className={
                        openPnl >= 0 ? 'text-[#089981]' : 'text-[#f23645]'
                      }
                    >
                      ${openPnl.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Open Positions</span>
                    <span className="text-gray-100">
                      {brokerData.positions.length}
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-[11px] text-gray-500">
                  Connect your TradeLocker account to snapshot live stats with
                  each journal entry.
                </p>
              )}
            </div>

            {/* Form */}
            <div className="md:flex-1 bg-[#131722] rounded-lg border border-[#2a2e39] p-3 flex flex-col gap-2">
              {/* Bias + entry type + confidence + position link */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Bias selector */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-400 uppercase">
                    Bias
                  </span>
                  <div className="flex gap-1">
                    {biasOptions.map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setBias(b)}
                        className={`px-2 py-1 rounded-full text-[10px] border transition-colors ${
                          bias === b
                            ? 'bg-[#2962ff] text-white border-[#2962ff]'
                            : 'bg-[#1e222d] text-gray-300 border-[#2a2e39] hover:border-[#2962ff]'
                        }`}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Entry type */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-400 uppercase">
                    Type
                  </span>
                  <div className="flex gap-1">
                    {entryTypeOptions.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setEntryType(t)}
                        className={`px-2 py-1 rounded-full text-[10px] border transition-colors ${
                          entryType === t
                            ? 'bg-[#2962ff] text-white border-[#2962ff]'
                            : 'bg-[#1e222d] text-gray-300 border-[#2a2e39] hover:border-[#2962ff]'
                        }`}
                      >
                        {t === 'SessionReview' ? 'Session' : t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Confidence */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-400 uppercase">
                    Confidence
                  </span>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setConfidence(v)}
                        className={`w-6 h-6 rounded-full text-[10px] flex items-center justify-center transition-colors ${
                          confidence === v
                            ? 'bg-[#2962ff] text-white'
                            : 'bg-[#1e222d] text-gray-300 border border-[#2a2e39] hover:border-[#2962ff]'
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Link to position */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-400 uppercase">
                    Link Trade
                  </span>
                  <select
                    value={linkedPositionId}
                    onChange={(e) => setLinkedPositionId(e.target.value)}
                    className="bg-[#0f131a] border border-[#2a2e39] text-[10px] text-gray-200 rounded px-2 py-1 focus:outline-none focus:border-[#2962ff]"
                  >
                    <option value="">None</option>
                    {availablePositions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.symbol} • {p.side.toUpperCase()} {p.size} @{' '}
                        {p.entryPrice.toFixed(2)} • PnL{' '}
                        {p.pnl.toFixed(2)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Note + tags */}
              <div className="flex flex-col gap-2 mt-1">
                <div className="flex items-end gap-2">
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    className="flex-1 bg-[#0f131a] border border-[#2a2e39] rounded-lg px-3 py-2 text-xs text-gray-100 focus:outline-none focus:border-[#2962ff] focus:ring-1 focus:ring-[#2962ff]/60 resize-none"
                    placeholder="What are you seeing? Why this trade? What invalidates the idea?"
                  />
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !note.trim()}
                    className="px-4 py-2 bg-[#2962ff] hover:bg-[#1e53e5] text-white text-xs font-semibold rounded-lg shadow disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {saving && (
                      <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    )}
                    Log Note
                  </button>
                </div>

                {/* Tags input */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-gray-400 uppercase">
                    Tags
                  </span>
                  <div className="flex-1 flex flex-wrap items-center gap-1">
                    {tags.map((t) => (
                      <span
                        key={t}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#1e222d] text-[10px] text-gray-200 border border-[#2a2e39]"
                      >
                        #{t}
                        <button
                          type="button"
                          onClick={() => removeTag(t)}
                          className="text-gray-500 hover:text-gray-200"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={handleTagKeyDown}
                      placeholder="Add tag (Enter)"
                      className="bg-[#0f131a] border border-[#2a2e39] text-[11px] text-gray-200 rounded px-2 py-1 focus:outline-none focus:border-[#2962ff]"
                    />
                  </div>
                </div>
              </div>

              {error && (
                <p className="text-[11px] text-red-400 mt-1">{error}</p>
              )}
            </div>
          </div>

          {/* Timeline filters */}
          <div className="flex items-center justify-between px-4 py-2 bg-[#0f131a] border-b border-[#2a2e39]">
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-gray-400 uppercase">
                Recent Entries
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400">Symbol</span>
                <select
                  value={activeSymbolFilter}
                  onChange={(e) => setActiveSymbolFilter(e.target.value)}
                  className="bg-[#131722] border border-[#2a2e39] text-[10px] text-gray-200 rounded px-2 py-1 focus:outline-none focus:border-[#2962ff]"
                >
                  {symbolOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400">Outcome</span>
                <div className="flex gap-1">
                  {outcomeFilters.map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() =>
                        setActiveOutcomeFilter(
                          o === 'All' ? 'All' : (o as TradeOutcome)
                        )
                      }
                      className={`px-2 py-0.5 rounded-full text-[10px] border transition-colors ${
                        activeOutcomeFilter === o
                          ? 'bg-[#2962ff] text-white border-[#2962ff]'
                          : 'bg-[#131722] text-gray-300 border-[#2a2e39] hover:border-[#2962ff]'
                      }`}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1 text-[10px] text-[#f23645] cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyLosers}
                  onChange={(e) => setOnlyLosers(e.target.checked)}
                  className="w-3 h-3 rounded border-[#2a2e39] bg-[#131722]"
                />
                Only losers
              </label>
              {loadingEntries && (
                <span className="text-[10px] text-gray-500 flex items-center gap-1">
                  <span className="w-3 h-3 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
                  Loading…
                </span>
              )}
            </div>
          </div>

          {/* Tag stats + timeline */}
          <div className="flex-1 overflow-y-auto bg-[#0f131a]">
            {tagStats.length > 0 && (
              <div className="sticky top-0 z-10 bg-[#0b0f16]/95 backdrop-blur-md border-b border-[#2a2e39] px-4 pt-3 pb-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-400 uppercase">
                      Pattern Stats by Tag
                    </span>
                    {overallStats && (
                      <span className="text-[10px] text-gray-400">
                        {overallStats.total} tagged decisions •{' '}
                        {overallStats.wins} W / {overallStats.losses} L /{' '}
                        {overallStats.breakEven} BE • Win-rate{' '}
                        {overallStats.wins + overallStats.losses > 0
                          ? (
                              (overallStats.wins /
                                (overallStats.wins +
                                  overallStats.losses)) *
                              100
                            ).toFixed(1)
                          : '–'}
                        % • Avg PnL{' '}
                        {overallStats.closedWithPnl > 0 ? (
                          <span
                            className={
                              overallStats.totalPnl >= 0
                                ? 'text-[#089981]'
                                : 'text-[#f23645]'
                            }
                          >
                            $
                            {(
                              overallStats.totalPnl /
                              overallStats.closedWithPnl
                            ).toFixed(2)}
                          </span>
                        ) : (
                          '–'
                        )}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-gray-500">
                    Tag entries like <span className="italic">LondonOpen</span>,{' '}
                    <span className="italic">US30Breakout</span>,{' '}
                    <span className="italic">NYKillzone</span>, etc.
                  </span>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {tagStats.map((s) => {
                    const winRate =
                      s.wins + s.losses > 0
                        ? (s.wins / (s.wins + s.losses)) * 100
                        : 0;
                    const avgPnl =
                      s.closedWithPnl > 0
                        ? s.totalPnl / s.closedWithPnl
                        : 0;
                    const pnlColor =
                      avgPnl > 0
                        ? 'text-[#089981]'
                        : avgPnl < 0
                        ? 'text-[#f23645]'
                        : 'text-gray-300';

                    return (
                      <button
                        key={s.tag}
                        type="button"
                        onClick={() => setSelectedTag(s)}
                        className="min-w-[160px] bg-[#131722] border border-[#2a2e39] rounded-lg px-3 py-2 flex flex-col gap-1 text-left hover:border-[#2962ff] hover:bg-[#171b24] transition-colors"
                      >
                        <div className="flex justify-between items-center">
                          <span className="text-[11px] font-semibold text-gray-100">
                            #{s.tag}
                          </span>
                          <span className="text-[10px] text-gray-500">
                            {s.total} trades
                          </span>
                        </div>
                        <div className="flex justify-between text-[10px] text-gray-300">
                          <span>
                            W:{' '}
                            <span className="text-[#089981]">
                              {s.wins}
                            </span>{' '}
                            L:{' '}
                            <span className="text-[#f23645]">
                              {s.losses}
                            </span>{' '}
                            BE:{' '}
                            <span className="text-gray-300">
                              {s.breakEven}
                            </span>
                          </span>
                          <span>
                            WR:{' '}
                            {s.wins + s.losses > 0
                              ? winRate.toFixed(1)
                              : '–'}
                            %
                          </span>
                        </div>
                        <div className={`text-[10px] ${pnlColor}`}>
                          Avg PnL:{' '}
                          {s.closedWithPnl > 0
                            ? `$${avgPnl.toFixed(2)}`
                            : '–'}
                        </div>
                        <div className="text-[9px] text-gray-500">
                          Samples with PnL:{' '}
                          {s.closedWithPnl}/{s.total}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {filteredEntries.length === 0 && !loadingEntries ? (
              <div className="px-4 py-4 text-[11px] text-gray-500">
                No journal entries match your filters. Log a note or relax the
                filters.
              </div>
            ) : (
              <div className="px-4 py-3 space-y-3">
                {filteredEntries.map((e) => renderEntryCard(e))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tag Drill-Down Modal */}
      {selectedTag && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0f131a] border border-[#2a2e39] rounded-xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden">
            {/* Modal header */}
            <div className="px-4 py-3 border-b border-[#2a2e39] flex items-center justify-between bg-[#131722]">
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full bg-[#1e222d] text-[11px] text-gray-100 border border-[#2a2e39]">
                    Tag Drill-Down
                  </span>
                  <span className="text-sm font-semibold text-white">
                    #{selectedTag.tag}
                  </span>
                </div>
                <span className="text-[10px] text-gray-400 mt-1">
                  All trades tagged with <span className="font-semibold">#{selectedTag.tag}</span>, plus symbol-level performance.
                </span>
              </div>
              <button
                onClick={() => setSelectedTag(null)}
                className="text-gray-400 hover:text-white p-1 rounded hover:bg-[#2a2e39] transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Summary row */}
              <div className="bg-[#131722] border border-[#2a2e39] rounded-lg p-3 flex flex-wrap items-center gap-4">
                <div>
                  <div className="text-[11px] text-gray-400 uppercase mb-1">
                    Overview
                  </div>
                  <div className="text-[11px] text-gray-200">
                    {selectedTag.total} tagged trades •{' '}
                    <span className="text-[#089981]">
                      {selectedTag.wins} wins
                    </span>{' '}
                    /{' '}
                    <span className="text-[#f23645]">
                      {selectedTag.losses} losses
                    </span>{' '}
                    /{' '}
                    <span className="text-gray-200">
                      {selectedTag.breakEven} BE
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-gray-400 uppercase mb-1">
                    Win-Rate
                  </div>
                  <div className="text-[13px] text-gray-100 font-semibold">
                    {selectedTag.wins + selectedTag.losses > 0
                      ? (
                          (selectedTag.wins /
                            (selectedTag.wins +
                              selectedTag.losses)) *
                          100
                        ).toFixed(1)
                      : '–'}
                    %
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-gray-400 uppercase mb-1">
                    Avg PnL (with data)
                  </div>
                  <div
                    className={`text-[13px] font-semibold ${
                      selectedTag.closedWithPnl > 0 &&
                      selectedTag.totalPnl < 0
                        ? 'text-[#f23645]'
                        : 'text-[#089981]'
                    }`}
                  >
                    {selectedTag.closedWithPnl > 0
                      ? `$${(
                          selectedTag.totalPnl /
                          selectedTag.closedWithPnl
                        ).toFixed(2)}`
                      : '–'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-gray-400 uppercase mb-1">
                    Samples with PnL
                  </div>
                  <div className="text-[13px] text-gray-100 font-semibold">
                    {selectedTag.closedWithPnl}/{selectedTag.total}
                  </div>
                </div>
              </div>

              {/* Symbol × Tag matrix for this tag */}
              {perSymbolStatsForSelectedTag.length > 0 && (
                <div className="bg-[#131722] border border-[#2a2e39] rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] text-gray-400 uppercase">
                      Symbol × #{selectedTag.tag}
                    </span>
                    <span className="text-[10px] text-gray-500">
                      See which instruments this pattern actually prints on.
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px] text-gray-200 border-collapse">
                      <thead>
                        <tr className="border-b border-[#2a2e39]">
                          <th className="py-1.5 px-2 text-left font-semibold text-gray-400">
                            Symbol
                          </th>
                          <th className="py-1.5 px-2 text-left font-semibold text-gray-400">
                            Trades
                          </th>
                          <th className="py-1.5 px-2 text-left font-semibold text-gray-400">
                            W / L / BE
                          </th>
                          <th className="py-1.5 px-2 text-left font-semibold text-gray-400">
                            Win-Rate
                          </th>
                          <th className="py-1.5 px-2 text-left font-semibold text-gray-400">
                            Avg PnL
                          </th>
                          <th className="py-1.5 px-2 text-left font-semibold text-gray-400">
                            PnL Samples
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {perSymbolStatsForSelectedTag.map((s) => {
                          const winRate =
                            s.wins + s.losses > 0
                              ? (s.wins / (s.wins + s.losses)) *
                                100
                              : 0;
                          const avgPnl =
                            s.closedWithPnl > 0
                              ? s.totalPnl / s.closedWithPnl
                              : 0;
                          const pnlColor =
                            avgPnl > 0
                              ? 'text-[#089981]'
                              : avgPnl < 0
                              ? 'text-[#f23645]'
                              : 'text-gray-300';

                          return (
                            <tr
                              key={s.symbol}
                              className="border-b border-[#2a2e39]/60 last:border-b-0"
                            >
                              <td className="py-1.5 px-2">
                                <span className="px-1.5 py-0.5 rounded-full bg-[#1e222d] border border-[#2a2e39] text-[10px]">
                                  {s.symbol}
                                </span>
                              </td>
                              <td className="py-1.5 px-2">
                                {s.total}
                              </td>
                              <td className="py-1.5 px-2">
                                <span className="text-[#089981]">
                                  {s.wins}W
                                </span>{' '}
                                /{' '}
                                <span className="text-[#f23645]">
                                  {s.losses}L
                                </span>{' '}
                                / {s.breakEven}BE
                              </td>
                              <td className="py-1.5 px-2">
                                {s.wins + s.losses > 0
                                  ? winRate.toFixed(1)
                                  : '–'}
                                %
                              </td>
                              <td className={`py-1.5 px-2 ${pnlColor}`}>
                                {s.closedWithPnl > 0
                                  ? `$${avgPnl.toFixed(2)}`
                                  : '–'}
                              </td>
                              <td className="py-1.5 px-2">
                                {s.closedWithPnl}/{s.total}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Entries list for this tag */}
              <div className="bg-[#131722] border border-[#2a2e39] rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] text-gray-400 uppercase">
                    All Entries with #{selectedTag.tag}
                  </span>
                  <span className="text-[10px] text-gray-500">
                    {entriesForSelectedTag.length} entries
                  </span>
                </div>
                {entriesForSelectedTag.length === 0 ? (
                  <div className="text-[11px] text-gray-500">
                    No entries found for this tag yet.
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[32vh] overflow-y-auto pr-1">
                    {entriesForSelectedTag.map((e) =>
                      renderEntryCard(e)
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default JournalPanel;
import React, { useEffect, useState } from 'react';
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

const biases: TradeBias[] = ['Bullish', 'Bearish', 'Neutral'];
const entryTypes: TradeEntryType[] = ['Pre-Trade', 'Post-Trade', 'SessionReview'];
const outcomes: TradeOutcome[] = ['Open', 'Win', 'Loss', 'BreakEven'];

const JournalPanel: React.FC<JournalPanelProps> = ({ sessionId, brokerData }) => {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);

  const [focusSymbol, setFocusSymbol] = useState('');
  const [bias, setBias] = useState<TradeBias>('Bullish');
  const [confidence, setConfidence] = useState<number>(3);
  const [entryType, setEntryType] = useState<TradeEntryType>('Pre-Trade');
  const [outcome, setOutcome] = useState<TradeOutcome>('Open');
  const [tagsInput, setTagsInput] = useState('');
  const [note, setNote] = useState('');
  const [linkedPositionId, setLinkedPositionId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openPositions = brokerData?.positions ?? [];

  // When broker data or positions change, auto-fill focusSymbol & linked position
  useEffect(() => {
    if (!focusSymbol && openPositions.length > 0) {
      setFocusSymbol(openPositions[0].symbol);
      setLinkedPositionId(openPositions[0].id);
    }
  }, [openPositions, focusSymbol]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!focusSymbol.trim()) {
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
      focusSymbol: focusSymbol.trim(),
      bias,
      confidence: Math.min(5, Math.max(1, Number(confidence) || 1)),
      note: note.trim(),
      entryType,
      outcome,
      tags,
      accountSnapshot,
      linkedPositionId: linkedPositionId || null,
      linkedSymbol: linkedPos ? linkedPos.symbol : null,
      // PnL + close time can be filled later by another feature if you want
      finalPnl: null,
      closedAt: null,
    };

    setSaving(true);
    try {
      await createJournalEntry(sessionId, payload);
      setNote('');
      setTagsInput('');
      if (entryType === 'Pre-Trade') {
        // keep outcome Open by default for pre-trade notes
        setOutcome('Open');
      }
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

  return (
    <div className="h-72 bg-[#1e222d] border-t border-[#2a2e39] flex text-xs shrink-0">
      {/* Left: New entry form */}
      <div className="w-2/3 border-r border-[#2a2e39] px-4 py-3 flex flex-col gap-2 overflow-y-auto">
        <div className="flex items-center justify-between mb-1 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-gray-400">
              Trade Journal
            </span>
            <span className="px-1.5 py-0.5 rounded-full bg-[#2962ff]/10 text-[#2962ff] text-[9px] font-semibold border border-[#2962ff]/40">
              /coach powered
            </span>
          </div>
          <div className="text-[10px] text-gray-500">
            Entries: {entries.length}
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-12 gap-2 items-start"
        >
          {/* Symbol + Bias */}
          <div className="col-span-3 space-y-1">
            <label className="text-[10px] text-gray-400 uppercase">Symbol</label>
            <input
              type="text"
              value={focusSymbol}
              onChange={(e) => setFocusSymbol(e.target.value)}
              className="w-full bg-[#131722] border border-[#2a2e39] rounded px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-[#2962ff]"
              placeholder="US30 / XAUUSD / BTCUSD"
            />
          </div>

          <div className="col-span-3 space-y-1">
            <label className="text-[10px] text-gray-400 uppercase">Bias</label>
            <select
              value={bias}
              onChange={(e) => setBias(e.target.value as TradeBias)}
              className="w-full bg-[#131722] border border-[#2a2e39] rounded px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-[#2962ff]"
            >
              {biases.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div className="col-span-2 space-y-1">
            <label className="text-[10px] text-gray-400 uppercase">
              Confidence
            </label>
            <input
              type="number"
              min={1}
              max={5}
              value={confidence}
              onChange={(e) => setConfidence(Number(e.target.value) || 1)}
              className="w-full bg-[#131722] border border-[#2a2e39] rounded px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-[#2962ff]"
            />
          </div>

          <div className="col-span-2 space-y-1">
            <label className="text-[10px] text-gray-400 uppercase">Type</label>
            <select
              value={entryType}
              onChange={(e) => setEntryType(e.target.value as TradeEntryType)}
              className="w-full bg-[#131722] border border-[#2a2e39] rounded px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-[#2962ff]"
            >
              {entryTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="col-span-2 space-y-1">
            <label className="text-[10px] text-gray-400 uppercase">
              Outcome
            </label>
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as TradeOutcome)}
              className="w-full bg-[#131722] border border-[#2a2e39] rounded px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-[#2962ff]"
            >
              {outcomes.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>

          {/* Tags */}
          <div className="col-span-4 space-y-1">
            <label className="text-[10px] text-gray-400 uppercase">
              Tags (space or comma)
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="w-full bg-[#131722] border border-[#2a2e39] rounded px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-[#2962ff]"
              placeholder="LondonOpen US30_M5 newsFade"
            />
          </div>

          {/* Link to open position (optional) */}
          <div className="col-span-4 space-y-1">
            <label className="text-[10px] text-gray-400 uppercase">
              Link to Position (optional)
            </label>
            <select
              value={linkedPositionId}
              onChange={(e) => setLinkedPositionId(e.target.value)}
              className="w-full bg-[#131722] border border-[#2a2e39] rounded px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-[#2962ff]"
            >
              <option value="">None</option>
              {openPositions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.symbol} {p.side.toUpperCase()} {p.size} @ {p.entryPrice} (PnL $
                  {p.pnl})
                </option>
              ))}
            </select>
          </div>

          {/* Note */}
          <div className="col-span-12 space-y-1">
            <label className="text-[10px] text-gray-400 uppercase">
              Note / Playbook reasoning
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full bg-[#131722] border border-[#2a2e39] rounded px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-[#2962ff] resize-none"
              placeholder="Why are you taking this? What is the exact playbook (tag) and risk context?"
            />
          </div>

          {/* Error + Save button */}
          <div className="col-span-8">
            {error && (
              <div className="mt-1 text-[10px] text-red-400">
                {error}
              </div>
            )}
          </div>
          <div className="col-span-4 flex justify-end items-end">
            <button
              type="submit"
              disabled={saving}
              className="px-3 py-1.5 rounded bg-[#2962ff] text-white text-[11px] font-semibold hover:bg-[#1e53e5] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              {saving && (
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              <span>Save Journal Entry</span>
            </button>
          </div>
        </form>

        <p className="mt-1 text-[9px] text-gray-500">
          Tip: keep your tags consistent (e.g. <span className="font-mono">LondonOpen</span>,{' '}
          <span className="font-mono">NYReversal</span>) so you can ask{' '}
          <span className="font-mono">/coach LondonOpen US30</span> in the chat.
        </p>
      </div>

      {/* Right: Recent entries */}
      <div className="w-1/3 px-3 py-3 flex flex-col">
        <div className="flex items-center justify-between mb-2 shrink-0">
          <span className="text-[10px] text-gray-400 uppercase tracking-wide">
            Recent Entries
          </span>
          {loadingEntries && (
            <span className="text-[9px] text-gray-500">Refreshing...</span>
          )}
        </div>
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {entries.slice(0, 8).map((e) => (
            <div
              key={e.id}
              className="bg-[#131722] border border-[#2a2e39] rounded px-2 py-1.5 text-[11px] text-gray-200"
            >
              <div className="flex justify-between items-center mb-0.5">
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-white">
                    {e.focusSymbol}
                  </span>
                  <span
                    className={`px-1 py-[1px] rounded-full text-[9px] border ${
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
                <span className="text-[9px] text-gray-500">
                  {formatTime(e.timestamp)}
                </span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-gray-400 mb-0.5">
                <span>{e.bias}</span>
                <span>•</span>
                <span>Conf {e.confidence}/5</span>
                {e.tags && e.tags.length > 0 && (
                  <>
                    <span>•</span>
                    <span className="truncate max-w-[140px]">
                      {e.tags.join(' ')}
                    </span>
                  </>
                )}
              </div>
              {e.note && (
                <p className="text-[10px] text-gray-300 line-clamp-3">
                  {e.note}
                </p>
              )}
            </div>
          ))}
          {entries.length === 0 && !loadingEntries && (
            <p className="text-[10px] text-gray-500">
              No entries yet. Log a few trades, then ask the chat{' '}
              <span className="font-mono">/coach TagName Symbol</span>.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default JournalPanel;
import React, { useEffect, useState } from 'react';
import {
  BrokerAccountInfo,
  JournalEntry,
  NewJournalEntryInput,
  TradeBias
} from '../types';
import {
  createJournalEntry,
  fetchJournalEntries
} from '../services/journalService';
import { FocusSymbol } from '../symbolMap';

interface JournalPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string | null;
  autoFocusSymbol: FocusSymbol;
  brokerData: BrokerAccountInfo | null;
}

const biasOptions: TradeBias[] = ['Bullish', 'Bearish', 'Neutral'];

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
  const [note, setNote] = useState('');
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openPnl =
    brokerData && brokerData.isConnected
      ? brokerData.equity - brokerData.balance
      : 0;

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

  if (!isOpen) return null;

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

    const payload: NewJournalEntryInput = {
      focusSymbol: autoFocusSymbol || 'Auto',
      bias,
      confidence,
      note: note.trim(),
      accountSnapshot: snapshot
    };

    try {
      const created = await createJournalEntry(sessionId, payload);
      setEntries((prev) => [created, ...prev]);
      setNote('');
    } catch (err: any) {
      setError(err.message || 'Failed to save journal entry');
    } finally {
      setSaving(false);
    }
  };

  return (
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
                Capture bias & reasoning before each move.
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {autoFocusSymbol && (
              <span className="px-2 py-0.5 rounded-full bg-[#131722] text-[10px] text-gray-300 border border-[#2a2e39]">
                Focus: <span className="font-semibold">{autoFocusSymbol}</span>
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
            </div>

            <div className="flex items-end gap-2 mt-1">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="flex-1 bg-[#0f131a] border border-[#2a2e39] rounded-lg px-3 py-2 text-xs text-gray-100 focus:outline-none focus:border-[#2962ff] focus:ring-1 focus:ring-[#2962ff]/60 resize-none"
                placeholder="What are you seeing? Why do you like or hate this setup? What would invalidate your idea?"
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

            {error && (
              <p className="text-[11px] text-red-400 mt-1">{error}</p>
            )}
          </div>
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto bg-[#0f131a]">
          <div className="px-4 py-2 flex items-center justify-between border-b border-[#2a2e39]">
            <span className="text-[11px] text-gray-400 uppercase">
              Recent Entries
            </span>
            {loadingEntries && (
              <span className="text-[10px] text-gray-500 flex items-center gap-1">
                <span className="w-3 h-3 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
                Loading…
              </span>
            )}
          </div>
          {entries.length === 0 && !loadingEntries ? (
            <div className="px-4 py-4 text-[11px] text-gray-500">
              No journal entries yet. Log your first thought about the current
              setup.
            </div>
          ) : (
            <div className="px-4 py-3 space-y-3">
              {entries.map((e) => {
                const date = new Date(e.timestamp);
                const openPnl =
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
                    <div className="flex justify-between items-center text-[10px] text-gray-400 mt-1">
                      <span>
                        Conf: <span className="text-gray-100">{e.confidence}/5</span>
                      </span>
                      {e.accountSnapshot && (
                        <span>
                          PnL @ note:{' '}
                          <span
                            className={
                              openPnl && openPnl < 0
                                ? 'text-[#f23645]'
                                : 'text-[#089981]'
                            }
                          >
                            $
                            {e.accountSnapshot.openPnl.toFixed(2)}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default JournalPanel;
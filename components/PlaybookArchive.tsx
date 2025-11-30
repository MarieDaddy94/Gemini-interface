import React, { useEffect, useState } from 'react';
import { fetchPlaybookLogs, PlaybookLogPayload } from '../services/playbookService';

const PlaybookArchive: React.FC = () => {
  const [logs, setLogs] = useState<PlaybookLogPayload[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const data = await fetchPlaybookLogs();
        if (mounted) {
          setLogs(data);
        }
      } catch (err) {
        console.error('Failed to load playbook logs', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="w-full h-full flex flex-col text-xs text-[#d1d4dc]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Playbook Archive</h2>
          <p className="text-[11px] text-gray-400">
            Snapshots saved from the AI Analysts&apos; Corner. Use this like a digital playbook binder.
          </p>
        </div>
        <div className="text-[10px] text-gray-400">
          Total Playbooks:{' '}
          <span className="text-gray-100 font-semibold">{logs.length}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto rounded-md border border-[#2a2e39] bg-[#1e222d]/80 p-3 space-y-3">
        {loading && (
          <div className="flex items-center gap-2 text-[11px] text-gray-300">
            <span className="w-3 h-3 border-2 border-[#2962ff] border-t-transparent rounded-full animate-spin" />
            <span>Loading playbooks...</span>
          </div>
        )}

        {!loading && logs.length === 0 && (
          <div className="text-[11px] text-gray-400">
            No playbooks have been saved yet. Click <span className="font-semibold">Save</span> in the
            AI Analysts&apos; Corner after a session to create your first one.
          </div>
        )}

        {!loading &&
          logs.map((log) => (
            <div
              key={log.id}
              className="bg-[#131722] border border-[#2a2e39] rounded-md px-3 py-2 flex flex-col gap-1"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/40">
                    {log.focusSymbol || 'Unknown'}
                  </span>
                  <span className="text-[11px] text-gray-300">
                    {log.sessionSummary.headlineBias}
                  </span>
                </div>
                <span className="text-[10px] text-gray-500">
                  {formatTime(log.timestamp)}
                </span>
              </div>

              {log.sessionSummary.keyLevels && (
                <div className="text-[10px] text-gray-400 mt-1">
                  <span className="font-semibold text-gray-300">Key levels: </span>
                  {log.sessionSummary.keyLevels}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
                <div className="bg-black/20 rounded p-2 border border-[#2a2e39]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] uppercase tracking-wide text-gray-400">
                      Scalp Lane
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#2962ff]/10 text-[#2962ff] border border-[#2962ff]/40">
                      {log.sessionSummary.scalpPlan.bias}
                    </span>
                  </div>
                  <ul className="text-[10px] text-gray-300 space-y-0.5">
                    <li>
                      <span className="font-semibold text-gray-400">Entry:</span>{' '}
                      {log.sessionSummary.scalpPlan.entryPlan || '—'}
                    </li>
                    <li>
                      <span className="font-semibold text-gray-400">Invalidation:</span>{' '}
                      {log.sessionSummary.scalpPlan.invalidation || '—'}
                    </li>
                    <li>
                      <span className="font-semibold text-gray-400">Targets:</span>{' '}
                      {log.sessionSummary.scalpPlan.targets || '—'}
                    </li>
                    <li>
                      <span className="font-semibold text-gray-400">R:R:</span>{' '}
                      {log.sessionSummary.scalpPlan.rr || '—'}
                    </li>
                  </ul>
                </div>

                <div className="bg-black/20 rounded p-2 border border-[#2a2e39]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] uppercase tracking-wide text-gray-400">
                      Swing Lane
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/40">
                      {log.sessionSummary.swingPlan.bias}
                    </span>
                  </div>
                  <ul className="text-[10px] text-gray-300 space-y-0.5">
                    <li>
                      <span className="font-semibold text-gray-400">Entry:</span>{' '}
                      {log.sessionSummary.swingPlan.entryPlan || '—'}
                    </li>
                    <li>
                      <span className="font-semibold text-gray-400">Invalidation:</span>{' '}
                      {log.sessionSummary.swingPlan.invalidation || '—'}
                    </li>
                    <li>
                      <span className="font-semibold text-gray-400">Targets:</span>{' '}
                      {log.sessionSummary.swingPlan.targets || '—'}
                    </li>
                    <li>
                      <span className="font-semibold text-gray-400">R:R:</span>{' '}
                      {log.sessionSummary.swingPlan.rr || '—'}
                    </li>
                  </ul>
                </div>
              </div>

              {log.sessionSummary.riskNotes && (
                <div className="text-[10px] text-amber-300 mt-1">
                  <span className="font-semibold uppercase tracking-wide">Risk Notes: </span>
                  {log.sessionSummary.riskNotes}
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
};

export default PlaybookArchive;
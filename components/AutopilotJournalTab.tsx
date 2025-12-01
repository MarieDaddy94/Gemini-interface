
import React, { useMemo } from 'react';
import { useAutopilotJournal } from '../context/AutopilotJournalContext';
import { AutopilotJournalEntry } from '../types';

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

const AutopilotJournalTab: React.FC = () => {
  const { entries } = useAutopilotJournal();

  const sortedEntries: AutopilotJournalEntry[] = useMemo(
    () =>
      [...entries].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      ),
    [entries]
  );

  return (
    <div className="autopilot-journal-tab h-full bg-[#050509] text-gray-100 flex flex-col">
      <div className="px-3 py-2 border-b border-gray-800">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Autopilot Journal
        </div>
        <div className="text-[11px] text-gray-400 mt-1">
          Every Autopilot plan (voice, panel, chat) and its risk verdict. Execution status updates when trades are run in SIM or live.
        </div>
      </div>

      <div className="flex-1 overflow-auto px-3 py-2">
        {sortedEntries.length === 0 ? (
          <div className="text-[11px] text-gray-500 mt-2">
            No Autopilot entries yet. Generate a plan from the Risk & Autopilot panel or via Voice Commander.
          </div>
        ) : (
          <table className="w-full text-[11px] border-collapse">
            <thead className="bg-[#101018]">
              <tr>
                <th className="px-2 py-1 text-left border-b border-gray-800">
                  Time
                </th>
                <th className="px-2 py-1 text-left border-b border-gray-800">
                  Instrument
                </th>
                <th className="px-2 py-1 text-left border-b border-gray-800">
                  Dir / Risk
                </th>
                <th className="px-2 py-1 text-left border-b border-gray-800">
                  Env / Mode
                </th>
                <th className="px-2 py-1 text-left border-b border-gray-800">
                  Verdict
                </th>
                <th className="px-2 py-1 text-left border-b border-gray-800">
                  Source
                </th>
                <th className="px-2 py-1 text-left border-b border-gray-800">
                  Exec
                </th>
                <th className="px-2 py-1 text-left border-b border-gray-800">
                  Summary
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedEntries.map((e) => {
                const verdict =
                  e.allowed && e.recommended
                    ? 'OK / Rec'
                    : e.allowed && !e.recommended
                    ? 'OK / NoRec'
                    : 'Blocked';

                return (
                  <tr key={e.id} className="border-b border-gray-900">
                    <td className="px-2 py-1 align-top text-gray-400">
                      {formatDateTime(e.createdAt)}
                    </td>
                    <td className="px-2 py-1 align-top">
                      {e.instrumentSymbol}
                    </td>
                    <td className="px-2 py-1 align-top">
                      {e.direction.toUpperCase()} @ {e.riskPercent.toFixed(2)}%
                    </td>
                    <td className="px-2 py-1 align-top">
                      {e.environment.toUpperCase()} /{' '}
                      {e.autopilotMode.toUpperCase()}
                    </td>
                    <td className="px-2 py-1 align-top">
                      {verdict === 'Blocked' ? (
                        <span className="text-red-400">{verdict}</span>
                      ) : verdict === 'OK / NoRec' ? (
                        <span className="text-yellow-400">{verdict}</span>
                      ) : (
                        <span className="text-emerald-400">{verdict}</span>
                      )}
                    </td>
                    <td className="px-2 py-1 align-top text-gray-400">
                      {e.source}
                    </td>
                    <td className="px-2 py-1 align-top">
                      {e.executionStatus === 'executed' ? (
                        <span className="text-emerald-400">EXECUTED</span>
                      ) : e.executionStatus === 'cancelled' ? (
                        <span className="text-yellow-400">CANCELLED</span>
                      ) : (
                        <span className="text-gray-500">Pending</span>
                      )}
                      {typeof e.pnl === 'number' && (
                        <div
                          className={
                            e.pnl >= 0 ? 'text-emerald-300' : 'text-red-300'
                          }
                        >
                          PnL: {e.pnl.toFixed(2)}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1 align-top text-gray-300 max-w-[260px]">
                      <div className="line-clamp-3 whitespace-pre-wrap">
                        {e.planSummary}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AutopilotJournalTab;

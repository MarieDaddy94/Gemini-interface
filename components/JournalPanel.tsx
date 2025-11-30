import React from "react";
import { useJournal } from "../context/JournalContext";
import { JournalEntry } from "../types";

const formatDateTime = (iso: string) => {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

const formatNumber = (value?: number, decimals: number = 2) => {
  if (typeof value !== "number" || Number.isNaN(value)) return "";
  return value.toFixed(decimals);
};

const shorten = (text?: string, maxLen: number = 80) => {
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
};

const getPnlClass = (pnl?: number) => {
  if (typeof pnl !== "number") return "";
  if (pnl > 0) return "pnl-positive";
  if (pnl < 0) return "pnl-negative";
  return "";
};

const getRClass = (r?: number) => {
  if (typeof r !== "number") return "";
  if (r >= 2) return "r-strong";
  if (r > 0) return "r-positive";
  if (r < 0) return "r-negative";
  return "";
};

const getDirectionBadge = (entry: JournalEntry) => {
  if (!entry.direction) return null;
  return (
    <span
      className={
        "direction-badge " +
        (entry.direction === "long"
          ? "direction-long"
          : "direction-short")
      }
    >
      {entry.direction === "long" ? "LONG" : "SHORT"}
    </span>
  );
};

// Renamed internally to TradingJournalPanel but keeping export as JournalPanel for App.tsx compatibility
const JournalPanel: React.FC<any> = () => {
  const { entries } = useJournal();

  return (
    <div className="trading-journal-panel w-full flex flex-col bg-[#050711] border-t border-[#151822] p-3 h-64 font-sans text-xs">
      <div className="journal-header flex justify-between items-baseline mb-2">
        <div className="journal-header-left">
          <h3 className="m-0 text-sm font-semibold text-gray-200">Trading Journal</h3>
          <span className="journal-subtitle block text-[11px] text-gray-500">
            AI + manual notes linked to your trades
          </span>
        </div>
        <div className="journal-header-right">
          <span className="journal-count text-[11px] text-gray-500">
            {entries.length} entries
          </span>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="journal-empty flex-1 flex items-center justify-center italic text-gray-600">
          No journal entries yet. When you trade and talk to the AI, it will start writing structured logs here.
        </div>
      ) : (
        <div className="journal-table-wrapper flex-1 overflow-auto">
          <table className="journal-table w-full border-collapse table-fixed">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="w-24">Date</th>
                <th className="w-16">Symbol</th>
                <th className="w-12">TF</th>
                <th className="w-16">Session</th>
                <th className="w-16">Dir</th>
                <th className="w-14">Size</th>
                <th className="w-20">PnL</th>
                <th className="w-12">R</th>
                <th className="w-32">Playbook</th>
                <th>Notes</th>
                <th className="w-12">Src</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const pnlClass = getPnlClass(entry.netPnl);
                const rClass = getRClass(entry.rMultiple);

                const notes =
                  entry.postTradeNotes ??
                  entry.preTradePlan ??
                  entry.note ??
                  "";

                return (
                  <tr key={entry.id}>
                    <td>{formatDateTime(entry.timestamp)}</td>
                    <td>{entry.symbol ?? entry.focusSymbol ?? ""}</td>
                    <td>{entry.timeframe ?? ""}</td>
                    <td>{entry.session ?? ""}</td>
                    <td>{getDirectionBadge(entry)}</td>
                    <td>{formatNumber(entry.size, 2)}</td>
                    <td className={pnlClass}>
                      {entry.netPnl != null
                        ? `${formatNumber(entry.netPnl, 2)} ${
                            entry.currency ?? ""
                          }`
                        : ""}
                    </td>
                    <td className={rClass}>
                      {entry.rMultiple != null
                        ? formatNumber(entry.rMultiple, 2)
                        : ""}
                    </td>
                    <td>{entry.playbook ?? ""}</td>
                    <td>{shorten(notes, 70)}</td>
                    <td className="journal-source text-center">
                      {entry.source === "ai" ? "AI" : "User"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default JournalPanel;
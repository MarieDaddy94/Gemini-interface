import React, { useState } from "react";
import { useJournal, JournalEntry } from "../context/JournalContext";

const JournalPanel: React.FC = () => {
  const { entries } = useJournal();
  const [showJournalCoachOnly, setShowJournalCoachOnly] = useState(false);

  const filteredEntries = showJournalCoachOnly
    ? entries.filter((e) => e.agentId === "journal_coach")
    : entries;

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  return (
    <div className="flex flex-col h-64 bg-[#050711] border-t border-[#151822] font-sans text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#151822]">
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-gray-200">Trading Journal</span>
          <span className="text-[11px] text-gray-500">
            {filteredEntries.length} entries {showJournalCoachOnly ? "(filtered)" : ""}
          </span>
        </div>

        <div className="flex items-center gap-2 text-gray-400">
          <span className="text-[10px] uppercase tracking-wide opacity-70">
            Filter
          </span>
          <button
            type="button"
            onClick={() => setShowJournalCoachOnly((v) => !v)}
            className={[
              "px-2 py-1 rounded-full border text-[10px] font-medium transition-colors",
              showJournalCoachOnly
                ? "border-amber-500/50 bg-amber-500/10 text-amber-300"
                : "border-[#2a2e39] bg-[#131722] text-gray-400 hover:bg-[#1e222d]",
            ].join(" ")}
          >
            {showJournalCoachOnly ? "Journal Coach • ON" : "Journal Coach Only"}
          </button>
        </div>
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[70px_60px_1.5fr_0.7fr_0.5fr_0.5fr_2.2fr] px-3 py-1 text-[11px] font-semibold text-gray-500 border-b border-[#151822] bg-[#0b0e17]">
        <div>Time</div>
        <div>Src</div>
        <div>Playbook</div>
        <div>Symbol</div>
        <div>Dir</div>
        <div>Res</div>
        <div>Notes</div>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto">
        {filteredEntries.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[11px] text-gray-600 italic">
            {showJournalCoachOnly
              ? "No Journal Coach entries yet. Switch to Post-Trade mode and chat to generate one."
              : "No journal entries yet."}
          </div>
        ) : (
          filteredEntries.map((entry) => (
            <div
              key={entry.id}
              className="grid grid-cols-[70px_60px_1.5fr_0.7fr_0.5fr_0.5fr_2.2fr] px-3 py-1.5 border-b border-[#151822] hover:bg-[#131722] items-center"
            >
              {/* Time */}
              <div className="text-[11px] text-gray-500 truncate">
                {formatTime(entry.timestamp)}
              </div>

              {/* Source (AI/manual) */}
              <div className="text-[10px]">
                {entry.source === "ai" ? (
                  <span className="px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/30">
                    AI
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded-full bg-gray-700/50 text-gray-300 border border-gray-600/30">
                    Manual
                  </span>
                )}
              </div>

              {/* Playbook */}
              <div className="truncate text-gray-300" title={entry.playbook}>
                {entry.playbook || "-"}
              </div>

              {/* Symbol */}
              <div className="text-gray-200 truncate">{entry.symbol || entry.focusSymbol || "-"}</div>

              {/* Direction */}
              <div className="text-[11px]">
                {entry.direction ? (
                  <span
                    className={`font-medium ${
                      entry.direction === "long"
                        ? "text-[#4ade80]"
                        : "text-[#f97373]"
                    }`}
                  >
                    {entry.direction === "long" ? "Long" : "Short"}
                  </span>
                ) : (
                  <span className="text-gray-600">-</span>
                )}
              </div>

              {/* Outcome */}
              <div className={`text-[11px] font-medium truncate
                  ${entry.outcome === 'Win' ? 'text-[#4ade80]' : 
                    entry.outcome === 'Loss' ? 'text-[#f97373]' : 
                    entry.outcome === 'BreakEven' ? 'text-yellow-400' : 'text-gray-400'
                  }`}>
                {entry.outcome || "Open"}
              </div>

              {/* Notes (summary) */}
              <div className="truncate text-gray-400" title={entry.note}>
                {entry.note || ""}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default JournalPanel;
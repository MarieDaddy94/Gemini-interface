
import React, { useMemo, useState } from "react";
import { useJournal } from "../context/JournalContext";
import { PlaybookReviewPayload } from "../types";
import JournalVisionPanel from "./JournalVisionPanel";

interface JournalPanelProps {
  onRequestPlaybookReview?: (payload: PlaybookReviewPayload) => void;
}

const JournalPanel: React.FC<JournalPanelProps> = ({ onRequestPlaybookReview }) => {
  const { entries, refreshJournal, loading } = useJournal();
  const [viewMode, setViewMode] = useState<"journal" | "vision">("journal");

  const handleRequestReview = () => {
    if (!onRequestPlaybookReview || entries.length === 0) return;
    // Map entries to the payload shape expected by the review system
    const topEntries = entries.slice(0, 5).map(e => ({
       id: e.id,
       playbook: e.playbook || 'Unknown',
       note: e.notes || '',
       outcome: e.status === 'closed' ? (e.resultPnl && e.resultPnl > 0 ? 'Win' : 'Loss') : 'Open',
       symbol: e.symbol,
       direction: e.direction
    }));

    onRequestPlaybookReview({
        mode: 'lessons',
        entries: topEntries
    });
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 border-t border-slate-800">
      <div className="flex items-center justify-between px-4 py-2 text-xs border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-4">
          <span className="font-semibold tracking-wide text-slate-200 uppercase">Journal</span>
          <div className="flex bg-slate-900 rounded border border-slate-700">
             <button onClick={() => setViewMode("journal")} className={`px-3 py-1 ${viewMode === 'journal' ? 'text-blue-400 bg-slate-800' : 'text-slate-400'}`}>List</button>
             <button onClick={() => setViewMode("vision")} className={`px-3 py-1 ${viewMode === 'vision' ? 'text-blue-400 bg-slate-800' : 'text-slate-400'}`}>Vision</button>
          </div>
        </div>
        <div className="flex gap-2">
           <button onClick={() => refreshJournal()} className="text-slate-400 hover:text-white">Refresh</button>
           <button onClick={handleRequestReview} className="text-amber-400 hover:text-amber-300">AI Review</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto text-xs min-h-0">
        {viewMode === 'vision' && <JournalVisionPanel />}
        
        {viewMode === 'journal' && (
           <div className="w-full">
              {loading && <div className="p-4 text-center text-gray-500">Loading entries...</div>}
              {!loading && entries.length === 0 && <div className="p-4 text-center text-gray-500">No journal entries found.</div>}
              
              {entries.map(e => (
                 <div key={e.id} className="border-b border-slate-900 hover:bg-slate-900/40 p-2 grid grid-cols-[80px,60px,1fr,100px] gap-2 items-center">
                    <div className="text-gray-500 text-[10px]">{new Date(e.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                    <div className="font-bold text-gray-300">{e.symbol}</div>
                    <div className="flex flex-col">
                       <div className="flex items-center gap-2">
                          <span className={`uppercase font-bold ${e.direction === 'long' ? 'text-green-400' : e.direction === 'short' ? 'text-red-400' : 'text-gray-400'}`}>{e.direction || '-'}</span>
                          <span className="text-gray-400">{e.playbook}</span>
                       </div>
                       <div className="text-gray-500 truncate">{e.notes}</div>
                    </div>
                    <div className="text-right">
                       <div className={`font-bold ${e.status === 'closed' ? (e.resultPnl && e.resultPnl > 0 ? 'text-green-400' : 'text-red-400') : 'text-yellow-500'}`}>
                          {e.status.toUpperCase()}
                       </div>
                       {e.resultR !== undefined && e.resultR !== null && (
                          <div className="text-gray-400">{Number(e.resultR).toFixed(2)}R</div>
                       )}
                    </div>
                 </div>
              ))}
           </div>
        )}
      </div>
    </div>
  );
};

export default JournalPanel;

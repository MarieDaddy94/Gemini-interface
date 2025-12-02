
import React, { useEffect, useState } from 'react';
import { modelLabApi, DeskSession } from '../services/modelLabApi';

const SessionTimeline: React.FC = () => {
    const [sessions, setSessions] = useState<DeskSession[]>([]);
    
    useEffect(() => {
        modelLabApi.getSessions().then(res => setSessions(res.sessions));
    }, []);

    const generateNow = async () => {
        const today = new Date().toISOString().split('T')[0];
        await modelLabApi.generateSessionSummary(today);
        const res = await modelLabApi.getSessions();
        setSessions(res.sessions);
    };

    return (
        <div className="bg-[#161a25] border border-gray-800 rounded-lg p-4 h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-gray-200">Desk Narrative History</h3>
                <button onClick={generateNow} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-[10px] rounded">
                    Summarize Today
                </button>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                {sessions.length === 0 && <div className="text-xs text-gray-500 italic">No session history yet.</div>}
                
                {sessions.map(sess => (
                    <div key={sess.id} className="relative pl-4 border-l-2 border-gray-700">
                        <div className="absolute -left-[5px] top-0 w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-[#161a25]"></div>
                        <div className="mb-1 flex items-center gap-2">
                            <span className="text-xs font-bold text-white">{sess.date}</span>
                            <span className={`text-[10px] px-1.5 rounded ${sess.stats.totalPnl >= 0 ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                                {sess.tags}
                            </span>
                        </div>
                        <div className="text-[11px] text-gray-300 leading-relaxed bg-black/20 p-2 rounded border border-white/5">
                            {sess.summary}
                        </div>
                        <div className="mt-1 flex gap-3 text-[10px] text-gray-500">
                            <span>Trades: {sess.stats.tradeCount}</span>
                            <span>Net R: {sess.stats.totalR?.toFixed(2)}R</span>
                            <span className={sess.stats.totalPnl >= 0 ? 'text-green-500' : 'text-red-500'}>
                                ${sess.stats.totalPnl?.toFixed(2)}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default SessionTimeline;

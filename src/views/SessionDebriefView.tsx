
import React from 'react';
import { useDesk } from '../context/DeskContext';
import { useAppWorld } from '../context/AppWorldContext';

const SessionDebriefView: React.FC = () => {
  const { state: { currentSession }, actions: { endSessionDebrief } } = useDesk();
  const { actions: { openRoom } } = useAppWorld();

  if (!currentSession) {
      return <div className="p-8 text-gray-500">No active session to debrief.</div>;
  }

  // If debrief not generated yet, show loading/button
  if (!currentSession.debrief) {
      return (
          <div className="flex flex-col h-full bg-[#0b0e14] items-center justify-center text-gray-200">
              <div className="w-96 text-center">
                  <h1 className="text-2xl font-bold mb-4">End Session & Debrief</h1>
                  <p className="text-gray-400 mb-8">
                      Stop trading. The Coach will review your PnL, journal, and execution against the plan.
                  </p>
                  <button 
                    onClick={() => endSessionDebrief()}
                    className="px-8 py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded shadow-lg transition-all"
                  >
                      Generate Debrief
                  </button>
              </div>
          </div>
      );
  }

  const db = currentSession.debrief;
  const score = db.scorecard;

  return (
    <div className="flex flex-col h-full bg-[#0b0e14] text-gray-200 p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto w-full">
            <div className="flex justify-between items-start mb-8 border-b border-gray-800 pb-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Session Debrief</h1>
                    <p className="text-gray-400 text-sm mt-1">{currentSession.date} • {currentSession.gameplan?.marketSession}</p>
                </div>
                <div className={`px-4 py-2 rounded text-sm font-bold uppercase tracking-wide border ${db.goalMet ? 'bg-green-500/20 text-green-400 border-green-500/40' : 'bg-red-500/20 text-red-400 border-red-500/40'}`}>
                    {db.goalMet ? "Goal Met" : "Goal Missed"}
                </div>
            </div>

            {/* Scorecard */}
            <div className="grid grid-cols-4 gap-4 mb-8">
                <div className="bg-[#161a25] p-4 rounded border border-gray-800 text-center">
                    <div className="text-gray-500 text-xs uppercase mb-1">Total R</div>
                    <div className={`text-2xl font-bold ${score.totalR >= 0 ? 'text-green-400' : 'text-red-400'}`}>{score.totalR.toFixed(2)}R</div>
                </div>
                <div className="bg-[#161a25] p-4 rounded border border-gray-800 text-center">
                    <div className="text-gray-500 text-xs uppercase mb-1">PnL</div>
                    <div className={`text-2xl font-bold ${score.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>${score.totalPnl.toFixed(2)}</div>
                </div>
                <div className="bg-[#161a25] p-4 rounded border border-gray-800 text-center">
                    <div className="text-gray-500 text-xs uppercase mb-1">Win Rate</div>
                    <div className="text-2xl font-bold text-blue-400">{(score.winRate * 100).toFixed(0)}%</div>
                </div>
                <div className="bg-[#161a25] p-4 rounded border border-gray-800 text-center">
                    <div className="text-gray-500 text-xs uppercase mb-1">Trades</div>
                    <div className="text-2xl font-bold text-gray-200">{score.tradeCount}</div>
                </div>
            </div>

            {/* Narrative */}
            <div className="bg-[#131722] border border-gray-700 rounded-lg p-6 mb-6">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">Coach's Narrative</h3>
                <div className="text-gray-200 leading-relaxed text-sm whitespace-pre-wrap">
                    {db.narrative}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-[#161a25] border border-gray-800 rounded-lg p-5">
                    <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wide mb-3">Best Execution</h3>
                    <div className="text-sm text-gray-300">
                        {db.bestTradeId ? `Trade #${db.bestTradeId} was highlighted as the peak execution.` : "No significant wins this session."}
                    </div>
                </div>

                <div className="bg-[#161a25] border border-gray-800 rounded-lg p-5">
                    <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wide mb-3">Improvements for Tomorrow</h3>
                    <ul className="list-disc list-inside text-sm text-gray-300 space-y-2">
                        {db.improvements.map((imp, i) => (
                            <li key={i}>{imp}</li>
                        ))}
                    </ul>
                </div>
            </div>

            <div className="mt-8 text-center">
                <button 
                    onClick={() => openRoom('analysis')}
                    className="text-gray-500 hover:text-white underline text-sm"
                >
                    View in Archive
                </button>
            </div>
        </div>
    </div>
  );
};

export default SessionDebriefView;

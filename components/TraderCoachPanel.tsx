
import React, { useState } from 'react';
import { useTradingSession } from '../context/TradingSessionContext';
import { fetchAutopilotCoach, CoachResponse } from '../services/historyApi';

const TraderCoachPanel: React.FC = () => {
  const { state } = useTradingSession();
  const [coach, setCoach] = useState<CoachResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRequestCoach = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const resp = await fetchAutopilotCoach(state);
      setCoach(resp);
    } catch (err: any) {
      console.error('Coach error:', err);
      setError(err?.message || 'Failed to fetch coach notes.');
    } finally {
      setIsLoading(false);
    }
  };

  const instrumentLabel =
    state.instrument.displayName || state.instrument.symbol;
  const timeframe = state.timeframe.currentTimeframe;
  const env = state.environment.toUpperCase();
  const mode = state.autopilotMode.toUpperCase();

  return (
    <div className="trader-coach-panel flex flex-col bg-[#050509] text-gray-100 border-l border-gray-800">
      <div className="px-3 py-2 border-b border-gray-800">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Trader Coach
        </div>
        <div className="text-[11px] text-gray-500 mt-1">
          See what your own Autopilot history says about {instrumentLabel} [
          {timeframe}] ({env}, {mode}) and get coaching notes.
        </div>
      </div>

      <div className="px-3 py-2 space-y-2 text-[11px] overflow-y-auto max-h-[320px]">
        <button
          type="button"
          className="px-3 py-1 rounded-md bg-amber-600 hover:bg-amber-500 text-[11px] disabled:bg-amber-900 disabled:cursor-not-allowed"
          onClick={handleRequestCoach}
          disabled={isLoading}
        >
          {isLoading ? 'Analyzing history...' : 'Analyze My History'}
        </button>

        {error && <div className="text-red-400">{error}</div>}

        {coach && (
          <>
            <section className="space-y-1">
              <div className="font-semibold text-gray-300">
                Stats (similar context)
              </div>
              <div className="border border-gray-700 rounded-md p-2 bg-[#101018] text-gray-200">
                <div>Total entries: {coach.stats.total}</div>
                <div>
                  Closed: {coach.stats.closed} | Wins: {coach.stats.wins} |
                  Losses: {coach.stats.losses} | BE: {coach.stats.breakeven}
                </div>
                <div>
                  Win rate:{' '}
                  {coach.stats.winRate.toFixed(1)}
                  %
                </div>
                <div>
                  Avg risk:{' '}
                  {coach.stats.avgRisk.toFixed(2)}
                  % | Avg PnL:{' '}
                  {coach.stats.avgPnl.toFixed(2)}
                </div>
                <div>
                  Current losing streak:{' '}
                  {coach.stats.losingStreak}
                </div>
                <div>
                  Recent direction bias:{' '}
                  {coach.stats.recentDirectionBias || 'none'}
                </div>
              </div>
            </section>

            <section className="space-y-1">
              <div className="font-semibold text-gray-300">Coach Notes</div>
              <div className="border border-gray-700 rounded-md p-2 bg-[#101018] whitespace-pre-wrap text-gray-200">
                {coach.coachNotes}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default TraderCoachPanel;

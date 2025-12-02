
import React, { useState } from 'react';
import { useTradingSession } from '../context/TradingSessionContext';
import { useRoundTableAutopilotPlan } from '../hooks/useRoundTableAutopilotPlan';
import { AutopilotCommand, RiskVerdict } from '../types';
import { useVision } from '../context/VisionContext';

interface RoundTablePanelProps {
  onCommandProposed?: (
    cmd: AutopilotCommand | null, 
    risk?: { verdict: RiskVerdict; comment: string | null }
  ) => void;
}

const RoundTablePanel: React.FC<RoundTablePanelProps> = ({ onCommandProposed }) => {
  const { state: sessionState } = useTradingSession();
  const { run, loading, error, lastResponse } = useRoundTableAutopilotPlan();
  const { latestVisionResult, visionSummary } = useVision();

  const [question, setQuestion] = useState('');

  const handleRunRoundTable = async () => {
    try {
      const response = await run({
        sessionState,
        userQuestion: question,
        visualSummary: visionSummary, // Fallback string if visionResult not used by backend
        visionResult: latestVisionResult, // Full structure
      });
      
      if (onCommandProposed) {
        onCommandProposed(response.autopilotCommand, response.autopilotCommandRisk);
      }
    } catch (err) {
      // Error is handled by hook state
    }
  };

  const result = lastResponse?.roundTable;

  return (
    <div className="roundtable-panel flex flex-col bg-[#050509] text-gray-100 border-l border-gray-800">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-800">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          AI Round-Table
        </div>
        <div className="text-[11px] text-gray-500 mt-1">
          Ask your AI team about the current market. Strategist, Pattern GPT,
          Risk Manager, and Execution Bot will each reply, then the Strategist
          synthesizes a final plan.
        </div>
      </div>

      {/* Body */}
      <div className="px-3 py-2 text-[11px] space-y-2 overflow-y-auto max-h-[360px]">
        {/* Input */}
        <div className="space-y-1">
          <div className="text-[10px] text-gray-400">
            Question / Scenario (optional)
          </div>
          <textarea
            className="w-full resize-none bg-[#101018] border border-gray-700 rounded-md px-2 py-1 text-[11px] h-[60px]"
            placeholder="Example: 'We just swept PDH on US30 at NY open with high volume. Should I look for a reversal or continuation?'"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <div className="flex justify-between items-center">
            <div className="text-[10px] text-gray-500 flex items-center gap-2">
              <span>Context auto-included.</span>
              {latestVisionResult && (
                <span className="text-blue-400 flex items-center gap-1">
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                  Vision Ready
                </span>
              )}
            </div>
            <button
              type="button"
              className="px-3 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-[11px] disabled:bg-indigo-900 disabled:cursor-not-allowed"
              onClick={handleRunRoundTable}
              disabled={loading}
            >
              {loading ? 'Running...' : 'Run Round-Table'}
            </button>
          </div>
        </div>

        {error && (
          <div className="text-red-400">
            {error}
          </div>
        )}

        {/* Final Summary */}
        {result && (
          <div className="space-y-2 mt-1">
            <section className="border border-gray-800 rounded-md p-2 bg-[#080812]">
              <div className="flex justify-between items-center mb-1">
                <div className="font-semibold text-gray-100 text-[11px]">
                  Final Gameplan (Moderator)
                </div>
                <div className="text-[10px] text-gray-500">
                  Synthesized by Strategist
                </div>
              </div>
              <div className="whitespace-pre-wrap text-gray-200 text-[11px]">
                {result.finalSummary}
              </div>
            </section>

            {/* Individual Agent Replies */}
            <section>
              <div className="text-[10px] text-gray-400 mb-1">
                Individual Agent Views
              </div>
              <div className="space-y-2">
                {result.agents.map((agent) => (
                  <div
                    key={agent.id}
                    className="border border-gray-800 rounded-md p-2 bg-[#050610]"
                  >
                    <div className="flex justify-between items-center mb-1">
                      <div>
                        <div className="font-semibold text-gray-100 text-[11px]">
                          {agent.displayName}
                        </div>
                        <div className="text-[10px] text-gray-500">
                          {agent.role}
                        </div>
                      </div>
                      <div className="text-[9px] text-gray-500 text-right">
                        {agent.provider} · {agent.model}
                      </div>
                    </div>
                    <div className="whitespace-pre-wrap text-gray-200 text-[11px]">
                      {agent.content}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {!result && !error && !loading && (
          <div className="text-[10px] text-gray-500 mt-2">
            Tip: Try running a round-table before and after big sessions (London
            / NY) to see how the team’s bias shifts as structure evolves.
          </div>
        )}
      </div>
    </div>
  );
};

export default RoundTablePanel;




import React, { useState } from 'react';
import { useTradingSession } from '../context/TradingSessionContext';
import { useRoundTableAutopilotPlan } from '../hooks/useRoundTableAutopilotPlan';
import { AutopilotCommand, RiskVerdict, VisionResult, ChartVisionAnalysis, JournalVisionAnalysis } from '../types';
import { useVision } from '../context/VisionContext';
import VoiceVisionConsole from './VoiceVisionConsole';

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
  
  // Local state for last known visions to pass to console
  const [lastJournalVision, setLastJournalVision] = useState<JournalVisionAnalysis | null>(null);
  // We assume latestVisionResult stores the primary chart analysis
  // If we had MTF vision result in global context, we'd pull it here too.

  const handleRunRoundTable = async (
    overrideQuestion?: string, 
    overrideVisualSummary?: string | null
  ) => {
    try {
      const response = await run({
        sessionState,
        userQuestion: overrideQuestion ?? question,
        visualSummary: overrideVisualSummary ?? visionSummary, 
        visionResult: latestVisionResult, 
      });
      
      if (onCommandProposed) {
        onCommandProposed(response.autopilotCommand, response.autopilotCommandRisk);
      }
    } catch (err) {
      // Error is handled by hook state
    }
  };

  const handleVoiceSessionSubmit = async ({
    transcript,
    chartVision,
    mtfAnalysis,
    journalInsights,
  }: {
    transcript: string;
    chartVision?: VisionResult | null;
    mtfAnalysis?: ChartVisionAnalysis | null;
    journalInsights?: JournalVisionAnalysis | null;
  }) => {
    // Construct rich context string
    const visualLines: string[] = [];

    if (chartVision) {
      visualLines.push('[Chart Vision]');
      visualLines.push(chartVision.summary || 'No summary available.');
    }
    if (mtfAnalysis) {
      visualLines.push('[MTF Vision]');
      visualLines.push(
        `HTF=${mtfAnalysis.htfBias || 'n/a'}, LTF=${mtfAnalysis.ltfBias || 'n/a'}, align=${
          typeof mtfAnalysis.alignmentScore === 'number'
            ? Math.round(mtfAnalysis.alignmentScore * 100) + '%'
            : 'n/a'
        }`,
      );
    }
    if (journalInsights) {
      setLastJournalVision(journalInsights); // keep local ref
      visualLines.push('[Journal Vision]');
      visualLines.push(journalInsights.coachingNotes || '');
    }

    const combinedVisualSummary = visualLines.length > 0 
       ? visualLines.join('\n') 
       : (visionSummary || null);

    // Update local text for visibility
    setQuestion(transcript);

    // Run the plan
    await handleRunRoundTable(transcript, combinedVisualSummary);
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
      <div className="px-3 py-2 text-[11px] space-y-3 overflow-y-auto max-h-[420px]">
        
        {/* Voice Console Integration */}
        <VoiceVisionConsole
          lastChartVision={latestVisionResult}
          lastJournalVision={lastJournalVision}
          onSubmitVoiceSession={handleVoiceSessionSubmit}
        />

        {/* Manual Input */}
        <div className="space-y-1 pt-2 border-t border-gray-800/50">
          <div className="text-[10px] text-gray-400">
            Manual Question / Scenario
          </div>
          <textarea
            className="w-full resize-none bg-[#101018] border border-gray-700 rounded-md px-2 py-1 text-[11px] h-[50px]"
            placeholder="e.g. 'We just swept PDH on US30 at NY open. Look for shorts?'"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <div className="flex justify-between items-center">
            <div className="text-[10px] text-gray-500 flex items-center gap-2">
              {latestVisionResult && (
                <span className="text-blue-400 flex items-center gap-1">
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                  Chart Vision
                </span>
              )}
            </div>
            <button
              type="button"
              className="px-3 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-[11px] disabled:bg-indigo-900 disabled:cursor-not-allowed"
              onClick={() => handleRunRoundTable()}
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
          <div className="space-y-2 mt-1 animate-fade-in">
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
          <div className="text-[10px] text-gray-500 mt-2 italic">
            Tip: Use the Voice Console above to speak to the desk while they look at your charts.
          </div>
        )}
      </div>
    </div>
  );
};

export default RoundTablePanel;

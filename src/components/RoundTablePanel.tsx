
import React, { useState } from 'react';
import { useTradingSession } from '../context/TradingSessionContext';
import { useRoundTableAutopilotPlan } from '../hooks/useRoundTableAutopilotPlan';
import { useAutopilotContext } from '../context/AutopilotContext';
import { useVision } from '../context/VisionContext';
import VoiceVisionConsole from './VoiceVisionConsole';
import { speakAgentLine } from '../services/agentSpeech';
import { SquadRole } from '../config/squadVoices';
import { useVoiceActivity } from '../context/VoiceActivityContext';
import { useRealtimeConfig } from '../context/RealtimeConfigContext';

const RoundTablePanel: React.FC = () => {
  const { state: sessionState } = useTradingSession();
  const { run, loading, error, lastResponse } = useRoundTableAutopilotPlan();
  const { latestVisionResult, visionSummary } = useVision();
  const { activeSpeaker } = useVoiceActivity();
  const { getVoiceProfile } = useRealtimeConfig();
  const { setProposal } = useAutopilotContext();

  const [question, setQuestion] = useState('');
  const [lastJournalVision, setLastJournalVision] = useState<any>(null);

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
      
      if (response.autopilotCommand) {
        setProposal(
            response.autopilotCommand, 
            'agent',
            response.autopilotCommandRisk 
              ? { verdict: response.autopilotCommandRisk.verdict, comment: response.autopilotCommandRisk.comment } 
              : undefined
        );
      }

      if (response.roundTable && response.roundTable.agents) {
         response.roundTable.agents.forEach(agent => {
             let role: SquadRole = 'strategist';
             const idLower = agent.id.toLowerCase();
             if (idLower.includes('risk')) role = 'risk';
             else if (idLower.includes('pattern') || idLower.includes('quant')) role = 'quant';
             else if (idLower.includes('exec')) role = 'execution';
             else if (idLower.includes('journal')) role = 'journal';
             
             const profile = getVoiceProfile(role);
             speakAgentLine(role, agent.content, profile);
         });
      }

    } catch (err) {
      // Error handled by hook
    }
  };

  const handleVoiceSessionSubmit = async ({ transcript }: { transcript: string }) => {
    setQuestion(transcript);
    await handleRunRoundTable(transcript, visionSummary);
  };

  const result = lastResponse?.roundTable;

  return (
    <div className="roundtable-panel flex flex-col bg-[#050509] text-gray-100 border-l border-gray-800">
      <div className="px-3 py-2 border-b border-gray-800 flex justify-between items-center">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          AI Round-Table
        </div>
        <div className="flex items-center gap-2">
          {activeSpeaker ? (
             <div className="flex items-center gap-1 bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded-full border border-emerald-500/20">
               <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
               <span className="text-[9px] font-bold uppercase">{activeSpeaker}</span>
             </div>
          ) : (
             <span className="text-[9px] text-gray-600">Silent</span>
          )}
        </div>
      </div>

      <div className="px-3 py-2 text-[11px] space-y-3 overflow-y-auto max-h-[420px]">
        <VoiceVisionConsole
          lastChartVision={latestVisionResult}
          onSubmitVoiceSession={handleVoiceSessionSubmit}
        />

        <div className="space-y-1 pt-2 border-t border-gray-800/50">
          <textarea
            className="w-full resize-none bg-[#101018] border border-gray-700 rounded-md px-2 py-1 text-[11px] h-[50px]"
            placeholder="Manual question..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <button
            type="button"
            className="w-full px-3 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-[11px] disabled:bg-indigo-900"
            onClick={() => handleRunRoundTable()}
            disabled={loading}
          >
            {loading ? 'Running...' : 'Run Round-Table'}
          </button>
        </div>

        {result && (
          <div className="space-y-2 mt-1 animate-fade-in">
            <section className="border border-gray-800 rounded-md p-2 bg-[#080812]">
              <div className="font-semibold text-gray-100 text-[11px] mb-1">Final Gameplan</div>
              <div className="whitespace-pre-wrap text-gray-200 text-[11px]">{result.finalSummary}</div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

export default RoundTablePanel;

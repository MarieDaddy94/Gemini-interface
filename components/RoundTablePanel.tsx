
import React, { useState } from 'react';
import { useTradingSession } from '../context/TradingSessionContext';
import { useAutopilotJournal } from '../context/AutopilotJournalContext';
import {
  runRoundTablePlan,
  RoundTableResponse,
  RoundTableTurn,
} from '../services/roundTableApi';
import { useVision } from '../context/VisionContext';

const RoundTablePanel: React.FC = () => {
  const { state, addMessage } = useTradingSession();
  const { addEntry } = useAutopilotJournal();
  const { visionSummary } = useVision();

  const [question, setQuestion] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<RoundTableResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [sendToChat, setSendToChat] = useState(true);

  const handleRun = async () => {
    setError(null);
    setResult(null);

    const q = question.trim();
    if (!q) {
      setError('Ask the squad a specific question first.');
      return;
    }

    setIsRunning(true);
    try {
      const resp = await runRoundTablePlan({
        sessionState: state,
        userQuestion: q,
        recentJournal: [],
        recentEvents: [],
        visualSummary: visionSummary || undefined,
      });

      setResult(resp);

      const instrumentSymbol =
        state.instrument.symbol || state.instrument.displayName;

      const biasDir =
        resp.finalPlan.bias === 'short'
          ? 'short'
          : resp.finalPlan.bias === 'neutral'
          ? 'long'
          : 'long';

      addEntry({
        instrumentSymbol,
        direction: biasDir,
        riskPercent: state.riskConfig.maxRiskPerTradePercent ?? 0,
        environment: state.environment,
        autopilotMode: state.autopilotMode,
        planSummary: resp.finalPlan.narrative || resp.finalPlan.checklist,
        allowed: true,
        recommended: resp.finalPlan.confidence >= 50,
        riskReasons: resp.riskFlags || [],
        riskWarnings: [],
        source: 'other',
        executionStatus: 'not_executed',
      });

      if (sendToChat) {
        const plan = resp.finalPlan;
        const lines: string[] = [];

        lines.push('Squad Round-table Summary');
        lines.push('');
        lines.push(
          `Bias: ${plan.bias.toUpperCase()} | TF: ${plan.timeframe} | Confidence: ${plan.confidence.toFixed(
            0
          )}%`
        );
        lines.push('');
        if (plan.narrative) {
          lines.push('Narrative:');
          lines.push(plan.narrative);
          lines.push('');
        }
        if (plan.entryPlan) {
          lines.push('Entry Plan:');
          lines.push(plan.entryPlan);
          lines.push('');
        }
        if (plan.riskPlan) {
          lines.push('Risk Plan:');
          lines.push(plan.riskPlan);
          lines.push('');
        }
        if (plan.management) {
          lines.push('Management:');
          lines.push(plan.management);
          lines.push('');
        }
        if (plan.checklist) {
          lines.push('Checklist:');
          lines.push(plan.checklist);
          lines.push('');
        }
        if (resp.riskFlags && resp.riskFlags.length > 0) {
          lines.push('Risk Flags:');
          resp.riskFlags.forEach((r, idx) => {
            lines.push(`  ${idx + 1}. ${r}`);
          });
          lines.push('');
        }
        if (visionSummary) {
          lines.push('Visual Snapshot (Gemini):');
          lines.push(visionSummary);
          lines.push('');
        }

        const content = lines.join('\n');

        addMessage({
          agentId: 'strategist-main',
          sender: 'agent',
          content,
          metadata: {
            via: 'roundtable',
          },
        });
      }
    } catch (err: any) {
      console.error('Round-table error:', err);
      setError(err?.message || 'Round-table failed.');
    } finally {
      setIsRunning(false);
    }
  };

  const renderTranscriptTurn = (t: RoundTableTurn, idx: number) => (
    <div key={idx} className="mb-1">
      <span className="font-semibold text-gray-200">
        {t.speaker || t.role}:
      </span>{' '}
      <span className="text-gray-300 whitespace-pre-wrap">
        {t.content}
      </span>
    </div>
  );

  return (
    <div className="roundtable-panel flex flex-col h-full bg-[#050509] text-gray-100 border-l border-gray-800">
      <div className="px-3 py-2 border-b border-gray-800">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Squad Round-table
        </div>
        <div className="text-[11px] text-gray-500 mt-1">
          Ask the AI trading team a question and let Strategist, Trend, Pattern,
          Risk, and Execution collaborate on a plan. If you ran Chart Vision
          recently, its summary is used as a VISUAL SNAPSHOT.
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3 text-[11px]">
        {/* Question input */}
        <section className="space-y-1">
          <div className="font-semibold text-gray-300">Question</div>
          <textarea
            className="w-full min-h-[60px] bg-[#101018] border border-gray-700 rounded-md px-2 py-1 text-[11px] resize-y"
            placeholder="Example: 'Given current US30 structure, should I be looking for long continuation scalps or a mean-reversion short into prior liquidity?'"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <div className="flex items-center gap-2 mt-1">
            <button
              type="button"
              className="px-3 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-[11px] disabled:bg-indigo-900 disabled:cursor-not-allowed"
              onClick={handleRun}
              disabled={isRunning}
            >
              {isRunning ? 'Running round-table...' : 'Run Squad Round-table'}
            </button>

            <label className="inline-flex items-center gap-1 text-[11px] text-gray-400">
              <input
                type="checkbox"
                className="h-3 w-3"
                checked={sendToChat}
                onChange={(e) => setSendToChat(e.target.checked)}
              />
              <span>Send summary to Chat</span>
            </label>
          </div>
          {error && (
            <div className="mt-1 text-[11px] text-red-400">{error}</div>
          )}
        </section>

        {/* Result */}
        {result && (
          <>
            <section className="space-y-1">
              <div className="font-semibold text-gray-300">Final Plan</div>
              <div className="border border-gray-700 rounded-md p-2 bg-[#101018] space-y-1">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold">Bias:</span>{' '}
                    {result.finalPlan.bias.toUpperCase()}
                  </div>
                  <div>
                    <span className="font-semibold">TF:</span>{' '}
                    {result.finalPlan.timeframe}{' '}
                    <span className="ml-2 font-semibold">Conf:</span>{' '}
                    {result.finalPlan.confidence.toFixed(0)}%
                  </div>
                </div>

                {result.finalPlan.narrative && (
                  <div className="mt-1">
                    <div className="font-semibold text-gray-300">
                      Narrative
                    </div>
                    <div className="text-gray-200 whitespace-pre-wrap">
                      {result.finalPlan.narrative}
                    </div>
                  </div>
                )}

                {result.finalPlan.entryPlan && (
                  <div className="mt-1">
                    <div className="font-semibold text-gray-300">
                      Entry Plan
                    </div>
                    <div className="text-gray-200 whitespace-pre-wrap">
                      {result.finalPlan.entryPlan}
                    </div>
                  </div>
                )}

                {result.finalPlan.riskPlan && (
                  <div className="mt-1">
                    <div className="font-semibold text-gray-300">
                      Risk Plan
                    </div>
                    <div className="text-gray-200 whitespace-pre-wrap">
                      {result.finalPlan.riskPlan}
                    </div>
                  </div>
                )}

                {result.finalPlan.management && (
                  <div className="mt-1">
                    <div className="font-semibold text-gray-300">
                      Management
                    </div>
                    <div className="text-gray-200 whitespace-pre-wrap">
                      {result.finalPlan.management}
                    </div>
                  </div>
                )}

                {result.finalPlan.checklist && (
                  <div className="mt-1">
                    <div className="font-semibold text-gray-300">
                      Checklist
                    </div>
                    <div className="text-gray-200 whitespace-pre-wrap">
                      {result.finalPlan.checklist}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {result.riskFlags && result.riskFlags.length > 0 && (
              <section className="space-y-1">
                <div className="font-semibold text-gray-300">Risk Flags</div>
                <div className="border border-yellow-700 rounded-md p-2 bg-[#15120a]">
                  <ul className="list-disc list-inside space-y-0.5">
                    {result.riskFlags.map((r, idx) => (
                      <li key={idx} className="text-yellow-300">
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            )}

            <section className="space-y-1">
              <button
                type="button"
                className="text-[11px] text-gray-400 underline"
                onClick={() => setShowTranscript((v) => !v)}
              >
                {showTranscript
                  ? 'Hide squad transcript'
                  : 'Show squad transcript'}
              </button>
              {showTranscript && (
                <div className="border border-gray-700 rounded-md p-2 bg-[#05060b] max-h-[220px] overflow-y-auto">
                  {result.transcript && result.transcript.length > 0 ? (
                    result.transcript.map(renderTranscriptTurn)
                  ) : (
                    <div className="text-gray-500">No transcript returned.</div>
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default RoundTablePanel;

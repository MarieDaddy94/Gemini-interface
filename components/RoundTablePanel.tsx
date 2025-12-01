
import React, { useState } from 'react';
import { useTradingSession } from '../context/TradingSessionContext';

interface RoundTableAgentMessage {
  id: string;
  displayName: string;
  role: string;
  provider: string;
  model: string;
  content: string;
}

interface RoundTableResult {
  finalSummary: string;
  bias: string;
  executionNotes: string;
  riskNotes: string;
  agents: RoundTableAgentMessage[];
}

const RoundTablePanel: React.FC = () => {
  const { state: sessionState } = useTradingSession();

  const [question, setQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RoundTableResult | null>(null);

  const handleRunRoundTable = async () => {
    setError(null);
    setIsLoading(true);
    setResult(null);

    try {
      const body = {
        sessionState,
        userQuestion: question,
        visualSummary: null, // later we can inject Gemini vision summary here
      };

      const resp = await fetch('/api/roundtable/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(
          `Round-table error (${resp.status}): ${resp.statusText} - ${text}`
        );
      }

      const json = (await resp.json()) as RoundTableResult;
      setResult(json);
    } catch (err: any) {
      console.error('RoundTablePanel error:', err);
      setError(err?.message || 'Failed to run round-table.');
    } finally {
      setIsLoading(false);
    }
  };

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
            <div className="text-[10px] text-gray-500">
              Context (symbol, TF, recent trades) is auto-included.
            </div>
            <button
              type="button"
              className="px-3 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-[11px] disabled:bg-indigo-900 disabled:cursor-not-allowed"
              onClick={handleRunRoundTable}
              disabled={isLoading}
            >
              {isLoading ? 'Running...' : 'Run Round-Table'}
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

        {!result && !error && !isLoading && (
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

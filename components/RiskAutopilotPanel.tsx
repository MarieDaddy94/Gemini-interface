
import React, { useState } from 'react';
import { useTradingSession } from '../context/TradingSessionContext';
import { useAutopilotJournal } from '../context/AutopilotJournalContext';
import {
  AutopilotMode,
  RiskConfig,
  RiskRuntimeState,
  AutopilotConfig,
  ProposedTrade,
  TradeDirection,
  RiskCheckResult,
} from '../types';
import { previewProposedTrade } from '../services/riskApi';
import {
  planAutopilotTrade,
  AutopilotPlanResponse,
} from '../services/autopilotApi';

const autopilotModes: AutopilotMode[] = ['off', 'advisor', 'semi', 'full'];

const RiskAutopilotPanel: React.FC = () => {
  const {
    state,
    setEnvironment,
    setAutopilotMode,
    setRiskConfig,
    updateRiskRuntime,
    setAutopilotConfig,
    addMessage,
  } = useTradingSession();

  const { addEntry } = useAutopilotJournal();

  const [proposedDirection, setProposedDirection] =
    useState<TradeDirection>('long');
  const [proposedRiskPercent, setProposedRiskPercent] = useState<number>(0.5);

  // Risk preview state
  const [previewResult, setPreviewResult] = useState<RiskCheckResult | null>(
    null
  );
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Autopilot plan state
  const [autopilotPlan, setAutopilotPlan] =
    useState<AutopilotPlanResponse | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [sendPlanToChat, setSendPlanToChat] = useState<boolean>(true);

  // -----------------------
  // Handlers: environment & mode
  // -----------------------

  const handleEnvironmentChange: React.ChangeEventHandler<HTMLSelectElement> = (
    e
  ) => {
    const value = e.target.value === 'live' ? 'live' : 'sim';
    setEnvironment(value);
  };

  const handleAutopilotModeChange: React.ChangeEventHandler<HTMLSelectElement> =
    (e) => {
      const value = e.target.value as AutopilotMode;
      setAutopilotMode(value);
    };

  // -----------------------
  // Handlers: risk config
  // -----------------------

  const handleRiskConfigChange = (
    field: keyof RiskConfig,
    value: number
  ) => {
    if (Number.isNaN(value)) return;
    setRiskConfig({ [field]: value });
  };

  const handleRiskRuntimeChange = (
    field: keyof RiskRuntimeState,
    value: number
  ) => {
    if (Number.isNaN(value)) return;
    updateRiskRuntime({ [field]: value });
  };

  const handleAutopilotConfigChange = (
    field: keyof AutopilotConfig,
    value: boolean
  ) => {
    setAutopilotConfig({ [field]: value });
  };

  // -----------------------
  // Handlers: trade preview (risk engine only)
  // -----------------------

  const handlePreview = async () => {
    setPreviewError(null);
    setPreviewResult(null);

    const riskPercent = Number(proposedRiskPercent);
    if (!riskPercent || riskPercent <= 0) {
      setPreviewError('Please enter a positive risk percent.');
      return;
    }

    const proposedTrade: ProposedTrade = {
      instrument: state.instrument,
      direction: proposedDirection,
      riskPercent,
      comment: 'Manual preview from RiskAutopilotPanel',
    };

    setIsPreviewing(true);
    try {
      const result = await previewProposedTrade({
        sessionState: state,
        proposedTrade,
      });
      setPreviewResult(result.risk);
    } catch (err: any) {
      console.error('Error previewing trade:', err);
      setPreviewError(err?.message || 'Failed to preview trade.');
    } finally {
      setIsPreviewing(false);
    }
  };

  // -----------------------
  // Handlers: Autopilot execution plan (risk + Execution Bot)
  // -----------------------

  const handlePlanAutopilot = async () => {
    setPlanError(null);
    setAutopilotPlan(null);

    const riskPercent = Number(proposedRiskPercent);
    if (!riskPercent || riskPercent <= 0) {
      setPlanError('Please enter a positive risk percent.');
      return;
    }

    setIsPlanning(true);
    try {
      const plan = await planAutopilotTrade(state, {
        direction: proposedDirection,
        riskPercent,
        notes: 'Manual Autopilot plan from RiskAutopilotPanel',
      });

      setAutopilotPlan(plan);

      // Log to Autopilot journal
      addEntry({
        instrumentSymbol:
          state.instrument.symbol || state.instrument.displayName,
        direction: proposedDirection,
        riskPercent,
        environment: state.environment,
        autopilotMode: state.autopilotMode,
        planSummary: plan.planSummary,
        allowed: plan.allowed,
        recommended: plan.recommended,
        riskReasons: plan.riskReasons || [],
        riskWarnings: plan.riskWarnings || [],
        source: 'risk-panel',
        executionStatus: 'not_executed',
      });

      if (sendPlanToChat) {
        const instrumentLabel =
          state.instrument.displayName || state.instrument.symbol;

        let content = `Autopilot Execution Plan\n\n`;
        content += `Instrument: ${instrumentLabel}\n`;
        content += `Direction: ${proposedDirection.toUpperCase()}\n`;
        content += `Risk: ${riskPercent.toFixed(2)}% of equity\n`;
        content += `Environment: ${state.environment.toUpperCase()}\n\n`;

        content += `Allowed by risk engine: ${
          plan.allowed ? 'YES' : 'NO'
        }\n`;
        content += `Recommended by Execution Bot: ${
          plan.recommended ? 'YES' : 'NO'
        }\n\n`;

        content += `Plan summary:\n${plan.planSummary}\n\n`;

        if (plan.riskReasons && plan.riskReasons.length > 0) {
          content += `Hard risk blocks:\n`;
          plan.riskReasons.forEach((r, idx) => {
            content += `  ${idx + 1}. ${r}\n`;
          });
          content += `\n`;
        }

        if (plan.riskWarnings && plan.riskWarnings.length > 0) {
          content += `Risk warnings:\n`;
          plan.riskWarnings.forEach((w, idx) => {
            content += `  ${idx + 1}. ${w}\n`;
          });
          content += `\n`;
        }

        addMessage({
          agentId: 'execution-bot',
          sender: 'agent',
          content,
          metadata: {
            via: 'autopilot-plan-panel',
          },
        });
      }
    } catch (err: any) {
      console.error('Error planning autopilot trade:', err);
      setPlanError(err?.message || 'Failed to generate Autopilot plan.');
    } finally {
      setIsPlanning(false);
    }
  };

  const riskConfig = state.riskConfig;
  const riskRuntime = state.riskRuntime;
  const autopilotConfig = state.autopilotConfig;

  const header = `${state.instrument.displayName || state.instrument.symbol} | ${
    state.timeframe.currentTimeframe
  } | ${state.environment.toUpperCase()} | Autopilot: ${state.autopilotMode.toUpperCase()}`;

  return (
    <div className="risk-autopilot-panel flex flex-col h-full bg-[#050509] text-gray-100 border-l border-gray-800">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-800">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Risk & Autopilot
        </div>
        <div className="text-xs text-gray-300 mt-1">
          {header}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-4 text-xs">

        {/* Environment & Autopilot Mode */}
        <section className="space-y-1">
          <div className="font-semibold text-gray-300">
            Environment & Mode
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[11px] text-gray-400">Environment:</label>
            <select
              className="bg-[#101018] border border-gray-700 rounded-md px-2 py-1 text-[11px]"
              value={state.environment}
              onChange={handleEnvironmentChange}
            >
              <option value="sim">Sim / Paper</option>
              <option value="live">Live / Funded</option>
            </select>

            <label className="text-[11px] text-gray-400 ml-3">
              Autopilot:
            </label>
            <select
              className="bg-[#101018] border border-gray-700 rounded-md px-2 py-1 text-[11px]"
              value={state.autopilotMode}
              onChange={handleAutopilotModeChange}
            >
              {autopilotModes.map((m) => (
                <option key={m} value={m}>
                  {m.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-1">
            <label className="inline-flex items-center gap-1 text-[11px] text-gray-400">
              <input
                type="checkbox"
                className="h-3 w-3"
                checked={autopilotConfig.allowFullAutoInLive}
                onChange={(e) =>
                  handleAutopilotConfigChange(
                    'allowFullAutoInLive',
                    e.target.checked
                  )
                }
              />
              <span>Allow FULL Autopilot in LIVE</span>
            </label>

            <label className="inline-flex items-center gap-1 text-[11px] text-gray-400">
              <input
                type="checkbox"
                className="h-3 w-3"
                checked={autopilotConfig.requireVoiceConfirmForFullAuto}
                onChange={(e) =>
                  handleAutopilotConfigChange(
                    'requireVoiceConfirmForFullAuto',
                    e.target.checked
                  )
                }
              />
              <span>Require voice confirm for FULL</span>
            </label>
          </div>
        </section>

        {/* Risk Limits */}
        <section className="space-y-1">
          <div className="font-semibold text-gray-300">
            Risk Limits
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-gray-400">
                Max risk / trade (%)
              </label>
              <input
                type="number"
                step={0.1}
                className="w-full bg-[#101018] border border-gray-700 rounded-md px-2 py-1 text-[11px]"
                value={riskConfig.maxRiskPerTradePercent}
                onChange={(e) =>
                  handleRiskConfigChange(
                    'maxRiskPerTradePercent',
                    Number(e.target.value)
                  )
                }
              />
            </div>
            <div>
              <label className="block text-[11px] text-gray-400">
                Max daily loss (%)
              </label>
              <input
                type="number"
                step={0.1}
                className="w-full bg-[#101018] border border-gray-700 rounded-md px-2 py-1 text-[11px]"
                value={riskConfig.maxDailyLossPercent}
                onChange={(e) =>
                  handleRiskConfigChange(
                    'maxDailyLossPercent',
                    Number(e.target.value)
                  )
                }
              />
            </div>
            <div>
              <label className="block text-[11px] text-gray-400">
                Max weekly loss (%)
              </label>
              <input
                type="number"
                step={0.1}
                className="w-full bg-[#101018] border border-gray-700 rounded-md px-2 py-1 text-[11px]"
                value={riskConfig.maxWeeklyLossPercent}
                onChange={(e) =>
                  handleRiskConfigChange(
                    'maxWeeklyLossPercent',
                    Number(e.target.value)
                  )
                }
              />
            </div>
            <div>
              <label className="block text-[11px] text-gray-400">
                Max trades / day
              </label>
              <input
                type="number"
                step={1}
                className="w-full bg-[#101018] border border-gray-700 rounded-md px-2 py-1 text-[11px]"
                value={riskConfig.maxTradesPerDay}
                onChange={(e) =>
                  handleRiskConfigChange(
                    'maxTradesPerDay',
                    Number(e.target.value)
                  )
                }
              />
            </div>
          </div>
        </section>

        {/* Runtime State */}
        <section className="space-y-1">
          <div className="font-semibold text-gray-300">
            Runtime State (for today / this week)
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[11px] text-gray-400">
                Trades taken today
              </label>
              <input
                type="number"
                step={1}
                className="w-full bg-[#101018] border border-gray-700 rounded-md px-2 py-1 text-[11px]"
                value={riskRuntime.tradesTakenToday}
                onChange={(e) =>
                  handleRiskRuntimeChange(
                    'tradesTakenToday',
                    Number(e.target.value)
                  )
                }
              />
            </div>
            <div>
              <label className="block text-[11px] text-gray-400">
                Realized today (%)
              </label>
              <input
                type="number"
                step={0.1}
                className="w-full bg-[#101018] border border-gray-700 rounded-md px-2 py-1 text-[11px]"
                value={riskRuntime.realizedPnlTodayPercent}
                onChange={(e) =>
                  handleRiskRuntimeChange(
                    'realizedPnlTodayPercent',
                    Number(e.target.value)
                  )
                }
              />
            </div>
            <div>
              <label className="block text-[11px] text-gray-400">
                Realized week (%)
              </label>
              <input
                type="number"
                step={0.1}
                className="w-full bg-[#101018] border border-gray-700 rounded-md px-2 py-1 text-[11px]"
                value={riskRuntime.realizedPnlWeekPercent}
                onChange={(e) =>
                  handleRiskRuntimeChange(
                    'realizedPnlWeekPercent',
                    Number(e.target.value)
                  )
                }
              />
            </div>
          </div>
          <div className="text-[11px] text-gray-500 mt-1">
            In a later phase, these will be updated automatically from your broker &
            trade journal. For now you can set them manually when testing.
          </div>
        </section>

        {/* Shared Trade Inputs */}
        <section className="space-y-1">
          <div className="font-semibold text-gray-300">
            Trade Parameters
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1">
              <label className="text-[11px] text-gray-400">Direction:</label>
              <select
                className="bg-[#101018] border border-gray-700 rounded-md px-2 py-1 text-[11px]"
                value={proposedDirection}
                onChange={(e) =>
                  setProposedDirection(e.target.value as TradeDirection)
                }
              >
                <option value="long">LONG</option>
                <option value="short">SHORT</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <label className="text-[11px] text-gray-400">
                Risk (% of equity):
              </label>
              <input
                type="number"
                step={0.1}
                className="w-20 bg-[#101018] border border-gray-700 rounded-md px-2 py-1 text-[11px]"
                value={proposedRiskPercent}
                onChange={(e) =>
                  setProposedRiskPercent(Number(e.target.value))
                }
              />
            </div>
          </div>
        </section>

        {/* Trade Preview (Risk Engine Only) */}
        <section className="space-y-1">
          <div className="font-semibold text-gray-300">
            Check Against Risk Rules
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-3 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-[11px] disabled:bg-blue-900 disabled:cursor-not-allowed"
              onClick={handlePreview}
              disabled={isPreviewing}
            >
              {isPreviewing ? 'Checking...' : 'Preview Trade (Risk Only)'}
            </button>
          </div>

          {previewError && (
            <div className="mt-1 text-[11px] text-red-400">
              {previewError}
            </div>
          )}

          {previewResult && (
            <div className="mt-2 text-[11px] space-y-1 border border-gray-700 rounded-md p-2 bg-[#101018]">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold">
                    Result:
                  </span>{' '}
                  {previewResult.allowed ? (
                    <span className="text-green-400">ALLOWED</span>
                  ) : (
                    <span className="text-red-400">BLOCKED</span>
                  )}
                </div>
                <div className="text-[10px] text-gray-400">
                  Projected daily loss if this stops out:{' '}
                  {previewResult.projectedDailyLossPercent.toFixed(2)}% | Weekly:{' '}
                  {previewResult.projectedWeeklyLossPercent.toFixed(2)}%
                </div>
              </div>

              {previewResult.reasons.length > 0 && (
                <div>
                  <div className="font-semibold text-red-400">
                    Reasons (hard blocks)
                  </div>
                  <ul className="list-disc list-inside space-y-0.5">
                    {previewResult.reasons.map((r, idx) => (
                      <li key={idx}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              {previewResult.warnings.length > 0 && (
                <div>
                  <div className="font-semibold text-yellow-400">
                    Warnings
                  </div>
                  <ul className="list-disc list-inside space-y-0.5">
                    {previewResult.warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {previewResult.reasons.length === 0 &&
                previewResult.warnings.length === 0 && (
                  <div className="text-[11px] text-gray-400">
                    No specific reasons or warnings. Trade is within your current
                    risk parameters.
                  </div>
                )}
            </div>
          )}
        </section>

        {/* Autopilot Execution Plan */}
        <section className="space-y-1">
          <div className="font-semibold text-gray-300">
            Autopilot Execution Plan (Risk + Execution Bot)
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-[11px] disabled:bg-emerald-900 disabled:cursor-not-allowed"
              onClick={handlePlanAutopilot}
              disabled={isPlanning}
            >
              {isPlanning ? 'Planning...' : 'Generate Autopilot Plan'}
            </button>

            <label className="inline-flex items-center gap-1 text-[11px] text-gray-400">
              <input
                type="checkbox"
                className="h-3 w-3"
                checked={sendPlanToChat}
                onChange={(e) => setSendPlanToChat(e.target.checked)}
              />
              <span>Send plan to Chat as Execution Bot</span>
            </label>
          </div>

          {planError && (
            <div className="mt-1 text-[11px] text-red-400">
              {planError}
            </div>
          )}

          {autopilotPlan && (
            <div className="mt-2 text-[11px] space-y-1 border border-gray-700 rounded-md p-2 bg-[#101018]">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold">
                    Risk verdict:
                  </span>{' '}
                  {autopilotPlan.allowed ? (
                    <span className="text-green-400">ALLOWED</span>
                  ) : (
                    <span className="text-red-400">BLOCKED</span>
                  )}
                </div>
                <div>
                  <span className="font-semibold">
                    Execution Bot:
                  </span>{' '}
                  {autopilotPlan.recommended ? (
                    <span className="text-emerald-400">RECOMMENDS</span>
                  ) : (
                    <span className="text-yellow-400">DOES NOT RECOMMEND</span>
                  )}
                </div>
              </div>

              <div className="mt-1">
                <div className="font-semibold text-gray-300">
                  Plan summary
                </div>
                <div className="mt-0.5 text-[11px] text-gray-200 whitespace-pre-wrap">
                  {autopilotPlan.planSummary}
                </div>
              </div>

              {autopilotPlan.riskReasons && autopilotPlan.riskReasons.length > 0 && (
                <div className="mt-1">
                  <div className="font-semibold text-red-400">
                    Hard risk blocks
                  </div>
                  <ul className="list-disc list-inside space-y-0.5">
                    {autopilotPlan.riskReasons.map((r, idx) => (
                      <li key={idx}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              {autopilotPlan.riskWarnings &&
                autopilotPlan.riskWarnings.length > 0 && (
                  <div className="mt-1">
                    <div className="font-semibold text-yellow-400">
                      Risk warnings
                    </div>
                    <ul className="list-disc list-inside space-y-0.5">
                      {autopilotPlan.riskWarnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default RiskAutopilotPanel;

import React, { useState } from 'react';
import { useTradingSession } from '../context/TradingSessionContext';
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

const autopilotModes: AutopilotMode[] = ['off', 'advisor', 'semi', 'full'];

const RiskAutopilotPanel: React.FC = () => {
  const {
    state,
    setEnvironment,
    setAutopilotMode,
    setRiskConfig,
    updateRiskRuntime,
    setAutopilotConfig,
  } = useTradingSession();

  const [proposedDirection, setProposedDirection] =
    useState<TradeDirection>('long');
  const [proposedRiskPercent, setProposedRiskPercent] = useState<number>(0.5);
  const [previewResult, setPreviewResult] = useState<RiskCheckResult | null>(
    null
  );
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  // Handlers: trade preview
  // -----------------------

  const handlePreview = async () => {
    setError(null);
    setPreviewResult(null);

    const riskPercent = Number(proposedRiskPercent);
    if (!riskPercent || riskPercent <= 0) {
      setError('Please enter a positive risk percent.');
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
      setError(err?.message || 'Failed to preview trade.');
    } finally {
      setIsPreviewing(false);
    }
  };

  const riskConfig = state.riskConfig;
  const riskRuntime = state.riskRuntime;
  const autopilotConfig = state.autopilotConfig;

  const header = `${state.instrument.displayName || state.instrument.symbol} | ${
    state.timeframe.currentTimeframe
  } | ${state.environment.toUpperCase()} | Autopilot: ${state.autopilotMode.toUpperCase()}`;

  return (
    <div className="risk-autopilot-panel flex flex-col h-full bg-[#1e222d] text-[#d1d4dc] border-l border-[#2a2e39]">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#2a2e39]">
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
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-gray-400">Environment:</label>
            <select
              className="bg-[#131722] border border-[#2a2e39] rounded-md px-2 py-1 text-[11px] text-[#d1d4dc]"
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
              className="bg-[#131722] border border-[#2a2e39] rounded-md px-2 py-1 text-[11px] text-[#d1d4dc]"
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

          <div className="flex items-center gap-3 mt-1">
            <label className="inline-flex items-center gap-1 text-[11px] text-gray-400">
              <input
                type="checkbox"
                className="h-3 w-3 accent-[#2962ff] bg-[#131722] border-[#2a2e39]"
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
                className="h-3 w-3 accent-[#2962ff] bg-[#131722] border-[#2a2e39]"
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
                className="w-full bg-[#131722] border border-[#2a2e39] rounded-md px-2 py-1 text-[11px] text-[#d1d4dc]"
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
                className="w-full bg-[#131722] border border-[#2a2e39] rounded-md px-2 py-1 text-[11px] text-[#d1d4dc]"
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
                className="w-full bg-[#131722] border border-[#2a2e39] rounded-md px-2 py-1 text-[11px] text-[#d1d4dc]"
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
                className="w-full bg-[#131722] border border-[#2a2e39] rounded-md px-2 py-1 text-[11px] text-[#d1d4dc]"
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
                className="w-full bg-[#131722] border border-[#2a2e39] rounded-md px-2 py-1 text-[11px] text-[#d1d4dc]"
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
                className="w-full bg-[#131722] border border-[#2a2e39] rounded-md px-2 py-1 text-[11px] text-[#d1d4dc]"
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
                className="w-full bg-[#131722] border border-[#2a2e39] rounded-md px-2 py-1 text-[11px] text-[#d1d4dc]"
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

        {/* Trade Preview */}
        <section className="space-y-1">
          <div className="font-semibold text-gray-300">
            Preview a Trade Against Risk Rules
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <label className="text-[11px] text-gray-400">Direction:</label>
              <select
                className="bg-[#131722] border border-[#2a2e39] rounded-md px-2 py-1 text-[11px] text-[#d1d4dc]"
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
                className="w-20 bg-[#131722] border border-[#2a2e39] rounded-md px-2 py-1 text-[11px] text-[#d1d4dc]"
                value={proposedRiskPercent}
                onChange={(e) =>
                  setProposedRiskPercent(Number(e.target.value))
                }
              />
            </div>

            <button
              type="button"
              className="ml-auto px-3 py-1 rounded-md bg-[#2962ff] hover:bg-[#1e53e5] text-white text-[11px] disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handlePreview}
              disabled={isPreviewing}
            >
              {isPreviewing ? 'Checking...' : 'Preview Trade'}
            </button>
          </div>

          {error && (
            <div className="mt-1 text-[11px] text-red-400">
              {error}
            </div>
          )}

          {previewResult && (
            <div className="mt-2 text-[11px] space-y-1 border border-[#2a2e39] rounded-md p-2 bg-[#131722]">
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
                  <ul className="list-disc list-inside space-y-0.5 text-gray-300">
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
                  <ul className="list-disc list-inside space-y-0.5 text-gray-300">
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
      </div>
    </div>
  );
};

export default RiskAutopilotPanel;
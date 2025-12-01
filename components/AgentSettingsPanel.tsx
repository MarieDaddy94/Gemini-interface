
import React, { useEffect, useState } from 'react';
import {
  AgentConfig,
  AgentProvider,
  fetchAgents,
  updateAgent,
} from '../services/agentSettingsApi';

// Preset model options per provider.
// You can tweak this list any time.
const OPENAI_MODELS = ['gpt-4o', 'gpt-4o-mini', 'o1-mini', 'o3-mini'];
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-1.5-pro-latest', 'gemini-1.5-flash-latest'];

const providerOptions: AgentProvider[] = ['openai', 'gemini'];

function getModelOptions(provider: AgentProvider): string[] {
  return provider === 'gemini' ? GEMINI_MODELS : OPENAI_MODELS;
}

const AgentSettingsPanel: React.FC = () => {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchAgents()
      .then((list) => {
        if (!mounted) return;
        setAgents(list);
        setError(null);
      })
      .catch((err) => {
        console.error('AgentSettings fetch error:', err);
        if (mounted) {
          setError(err?.message || 'Failed to load agents.');
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleUpdate = async (
    id: string,
    nextProvider?: AgentProvider,
    nextModel?: string
  ) => {
    const agent = agents.find((a) => a.id === id);
    if (!agent) return;

    const provider = nextProvider ?? agent.provider;
    const model =
      nextModel ??
      agent.model ??
      getModelOptions(provider)[0] ??
      'gpt-4o-mini';

    setSavingId(id);
    setError(null);

    try {
      const updated = await updateAgent(id, { provider, model });
      setAgents((prev) =>
        prev.map((a) => (a.id === id ? updated : a))
      );
    } catch (err: any) {
      console.error('AgentSettings update error:', err);
      setError(err?.message || 'Failed to update agent.');
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="agent-settings-panel px-3 py-2 text-[11px] text-gray-400">
        Loading agent settings...
      </div>
    );
  }

  return (
    <div className="agent-settings-panel flex flex-col bg-[#050509] text-gray-100 border-l border-gray-800">
      <div className="px-3 py-2 border-b border-gray-800">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Agent Settings
        </div>
        <div className="text-[11px] text-gray-500 mt-1">
          Choose which model each AI team member runs on. Changes apply to new
          calls immediately and are saved in agentConfig.json.
        </div>
      </div>

      <div className="px-3 py-2 text-[11px] overflow-y-auto max-h-[320px]">
        {error && (
          <div className="mb-2 text-red-400">
            {error}
          </div>
        )}

        <div className="border border-gray-800 rounded-md overflow-hidden">
          <div className="grid grid-cols-[1.1fr,0.9fr,1.2fr] gap-0 bg-[#080812] text-gray-400 text-[10px] font-semibold uppercase tracking-wide px-2 py-1">
            <div>Agent</div>
            <div>Provider</div>
            <div>Model</div>
          </div>

          {agents.map((agent) => {
            const modelOptions = getModelOptions(agent.provider);
            const isSaving = savingId === agent.id;

            return (
              <div
                key={agent.id}
                className="grid grid-cols-[1.1fr,0.9fr,1.2fr] gap-0 items-center border-t border-gray-800 px-2 py-1 text-[11px]"
              >
                <div className="pr-2">
                  <div className="font-semibold text-gray-100">
                    {agent.displayName}
                  </div>
                  <div className="text-[10px] text-gray-500">
                    {agent.role}
                  </div>
                </div>

                <div className="pr-2">
                  <select
                    className="w-full bg-[#101018] border border-gray-700 rounded-md px-1 py-0.5 text-[11px]"
                    value={agent.provider}
                    disabled={isSaving}
                    onChange={(e) =>
                      handleUpdate(
                        agent.id,
                        e.target
                          .value as AgentProvider,
                        undefined
                      )
                    }
                  >
                    {providerOptions.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <select
                    className="w-full bg-[#101018] border border-gray-700 rounded-md px-1 py-0.5 text-[11px]"
                    value={agent.model}
                    disabled={isSaving}
                    onChange={(e) =>
                      handleUpdate(agent.id, undefined, e.target.value)
                    }
                  >
                    {modelOptions.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                    {/* In case config has a model not in our presets, keep it visible */}
                    {!modelOptions.includes(agent.model) && (
                      <option value={agent.model}>{agent.model}</option>
                    )}
                  </select>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-2 text-[10px] text-gray-500">
          Tip: Keep Strategist and Risk Manager on deeper models (gpt-4o /
          gemini-2.5-flash) and put parsing / execution bots on mini/flash
          variants for speed.
        </div>
      </div>
    </div>
  );
};

export default AgentSettingsPanel;

import React, { useEffect, useState } from 'react';
import {
  AgentConfig,
  AgentProvider,
  fetchAgents,
  updateAgent,
  createAgentApi,
  deleteAgentApi,
} from '../services/agentSettingsApi';

// Preset model options per provider.
const OPENAI_MODELS = ['gpt-5.1', 'gpt-5.1-mini'];
const GEMINI_MODELS = ['gemini-1.5-pro-latest', 'gemini-1.5-flash-latest'];

const providerOptions: AgentProvider[] = ['openai', 'gemini'];

function getModelOptions(provider: AgentProvider): string[] {
  return provider === 'gemini' ? GEMINI_MODELS : OPENAI_MODELS;
}

const AgentSettingsPanel: React.FC = () => {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Expansion state
  const [isExpanded, setIsExpanded] = useState(false);

  // Builder form state
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newProvider, setNewProvider] = useState<AgentProvider>('openai');
  const [newModel, setNewModel] = useState<string>(OPENAI_MODELS[0]);
  const [newCaps, setNewCaps] = useState(''); // comma-separated

  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
      'gpt-5.1-mini';

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

  const handleCreate = async () => {
    setError(null);

    const rawId = newId.trim();
    const name = newName.trim();
    const role = newRole.trim();

    if (!rawId || !name || !role) {
      setError('Please fill in ID, Name, and Role for the new agent.');
      return;
    }

    const normalizedId = rawId.toLowerCase().replace(/\s+/g, '-');
    const caps =
      newCaps
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean) || [];

    setCreating(true);
    try {
      const created = await createAgentApi({
        id: normalizedId,
        displayName: name,
        role,
        provider: newProvider,
        model: newModel || getModelOptions(newProvider)[0],
        capabilities: caps,
      });

      setAgents((prev) => [...prev, created]);
      setNewId('');
      setNewName('');
      setNewRole('');
      setNewCaps('');
    } catch (err: any) {
      console.error('AgentSettings create error:', err);
      setError(err?.message || 'Failed to create agent.');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    setDeletingId(id);
    try {
      await deleteAgentApi(id);
      setAgents((prev) => prev.filter((a) => a.id !== id));
    } catch (err: any) {
      console.error('AgentSettings delete error:', err);
      setError(err?.message || 'Failed to delete agent.');
    } finally {
      setDeletingId(null);
    }
  };

  // keep newModel in sync when provider changes
  useEffect(() => {
    const options = getModelOptions(newProvider);
    if (!options.includes(newModel)) {
      setNewModel(options[0]);
    }
  }, [newProvider, newModel]);

  // --- RENDER HELPERS ---

  const renderContent = () => (
    <div className={`flex flex-col h-full bg-[#050509] text-gray-100 ${!isExpanded ? 'border-l border-gray-800' : ''}`}>
      <div className="px-3 py-2 border-b border-gray-800 shrink-0 flex justify-between items-start">
        <div>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Agent Builder & Settings
          </div>
          <div className="text-[11px] text-gray-500 mt-1">
            Create custom AI teammates. Config saved to agentConfig.json.
          </div>
        </div>
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-gray-500 hover:text-white transition-colors p-1"
          title={isExpanded ? "Collapse" : "Expand"}
        >
          {isExpanded ? (
             <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>
          ) : (
             <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3 text-[11px]">
        {error && (
          <div className="mb-1 text-red-400">
            {error}
          </div>
        )}

        {/* Builder form */}
        <section className="border border-gray-800 rounded-md p-2 bg-[#050610] space-y-2">
          <div className="font-semibold text-gray-200 text-[11px]">
            Create New Agent
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10px] text-gray-400 mb-0.5">
                Agent ID (no spaces)
              </div>
              <input
                className="w-full bg-[#101018] border border-gray-700 rounded-md px-2 py-1 text-[11px]"
                placeholder="e.g. london-snipe-bot"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
              />
            </div>
            <div>
              <div className="text-[10px] text-gray-400 mb-0.5">
                Display Name
              </div>
              <input
                className="w-full bg-[#101018] border border-gray-700 rounded-md px-2 py-1 text-[11px]"
                placeholder="e.g. London Session Sniper"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
          </div>

          <div>
            <div className="text-[10px] text-gray-400 mb-0.5">
              Role / Description
            </div>
            <input
              className="w-full bg-[#101018] border border-gray-700 rounded-md px-2 py-1 text-[11px]"
              placeholder="e.g. Specializes in London session reversals on US30"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-3 gap-2 items-center">
            <div>
              <div className="text-[10px] text-gray-400 mb-0.5">
                Provider
              </div>
              <select
                className="w-full bg-[#101018] border border-gray-700 rounded-md px-1 py-1 text-[11px]"
                value={newProvider}
                onChange={(e) =>
                  setNewProvider(e.target.value as AgentProvider)
                }
              >
                {providerOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <div className="text-[10px] text-gray-400 mb-0.5">
                Model
              </div>
              <select
                className="w-full bg-[#101018] border border-gray-700 rounded-md px-1 py-1 text-[11px]"
                value={newModel}
                onChange={(e) => setNewModel(e.target.value)}
              >
                {getModelOptions(newProvider).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="text-[10px] text-gray-400 mb-0.5">
              Capabilities (comma-separated)
            </div>
            <input
              className="w-full bg-[#101018] border border-gray-700 rounded-md px-2 py-1 text-[11px]"
              placeholder="e.g. london, reversals, volume, news-filter"
              value={newCaps}
              onChange={(e) => setNewCaps(e.target.value)}
            />
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              className="px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-[11px] disabled:bg-emerald-900 disabled:cursor-not-allowed"
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? 'Creating...' : 'Create Agent'}
            </button>
          </div>
        </section>

        {/* Settings table */}
        <section>
          <div className="border border-gray-800 rounded-md overflow-hidden">
            <div className="grid grid-cols-[1.2fr,0.9fr,1.2fr,0.5fr] gap-0 bg-[#080812] text-gray-400 text-[10px] font-semibold uppercase tracking-wide px-2 py-1">
              <div>Agent</div>
              <div>Provider</div>
              <div>Model</div>
              <div></div>
            </div>

            {agents.map((agent) => {
              const modelOptions = getModelOptions(agent.provider);
              const isSaving = savingId === agent.id;
              const isDeleting = deletingId === agent.id;

              return (
                <div
                  key={agent.id}
                  className="grid grid-cols-[1.2fr,0.9fr,1.2fr,0.5fr] gap-0 items-center border-t border-gray-800 px-2 py-1 text-[11px]"
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
                          e.target.value as AgentProvider,
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

                  <div className="pr-2">
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
                      {!modelOptions.includes(agent.model) && (
                        <option value={agent.model}>{agent.model}</option>
                      )}
                    </select>
                  </div>

                  <div className="flex justify-end">
                    {!agent.builtin && (
                      <button
                        type="button"
                        className="px-2 py-0.5 rounded-md bg-red-700 hover:bg-red-600 text-[10px] disabled:bg-red-900 disabled:cursor-not-allowed"
                        onClick={() => handleDelete(agent.id)}
                        disabled={isDeleting}
                      >
                        {isDeleting ? '...' : 'Delete'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-2 text-[10px] text-gray-500 pb-2">
            Built-in agents (Strategist, Risk Manager, etc.) can be retuned to
            different models but not deleted. Custom agents can be removed
            any time.
          </div>
        </section>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="agent-settings-panel px-3 py-2 text-[11px] text-gray-400 border-l border-gray-800">
        Loading agent settings...
      </div>
    );
  }

  if (isExpanded) {
    return (
      <>
        {/* Placeholder to keep the grid slot filled (visual balance) */}
        <div className="agent-settings-panel flex flex-col h-full bg-[#050509] border-l border-gray-800 opacity-25">
           <div className="flex-1 flex items-center justify-center">
              <span className="text-gray-500 text-xs">Expanded View Active</span>
           </div>
        </div>

        {/* Modal Overlay */}
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
           <div className="w-full max-w-4xl h-[85vh] bg-[#050509] border border-gray-600 rounded-lg shadow-2xl flex flex-col overflow-hidden">
              {renderContent()}
           </div>
        </div>
      </>
    );
  }

  // Normal render
  return (
    <div className="agent-settings-panel h-full w-full">
       {renderContent()}
    </div>
  );
};

export default AgentSettingsPanel;
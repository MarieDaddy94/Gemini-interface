
// src/services/agentSettingsApi.ts

export type AgentProvider = 'openai' | 'gemini';

export interface AgentConfig {
  id: string;
  displayName: string;
  role: string;
  provider: AgentProvider;
  model: string;
  speed?: string;
  capabilities?: string[];
}

export interface AgentListResponse {
  agents: AgentConfig[];
}

export async function fetchAgents(): Promise<AgentConfig[]> {
  const resp = await fetch('/api/agents');
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `Failed to fetch agents (${resp.status}): ${resp.statusText} - ${text}`
    );
  }
  const json = (await resp.json()) as AgentListResponse;
  return json.agents;
}

export async function updateAgent(
  id: string,
  patch: Partial<Pick<AgentConfig, 'provider' | 'model'>>
): Promise<AgentConfig> {
  const resp = await fetch(`/api/agents/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `Failed to update agent (${resp.status}): ${resp.statusText} - ${text}`
    );
  }

  return (await resp.json()) as AgentConfig;
}

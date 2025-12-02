// src/services/geminiToolHandlers.ts

export type GeminiLiveSession = {
  sendToolResponse: (params: {
    toolResponse: {
      functionResponses: Array<{
        name: string;
        response: any;
        id?: string;
      }>;
    };
  }) => void;
};

export type GeminiToolCall = {
  functionCalls?: Array<{
    id?: string;
    name?: string;
    args?: Record<string, any>;
  }>;
};

// Ensure this matches your Vite/env config
const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000';

async function callBackendTool(
  fnName: string,
  args: Record<string, any> | undefined
): Promise<any> {
  const body = args ?? {};

  if (fnName === "get_chart_playbook") {
    // mirror the OpenAI path: use /api/tools/playbooks with query params
    const params = new URLSearchParams();
    if (body.symbol) params.set("symbol", String(body.symbol));
    if (body.timeframe) params.set("timeframe", String(body.timeframe));
    if (body.direction) params.set("direction", String(body.direction));

    const res = await fetch(`${API_BASE_URL}/api/tools/playbooks?${params.toString()}`);
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${text}` };
    }
    return res.json();
  }

  if (fnName === "log_trade_journal") {
    const res = await fetch(`${API_BASE_URL}/api/tools/journal-entry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${text}` };
    }
    return res.json();
  }

  if (fnName === "get_autopilot_proposal") {
    const res = await fetch(`${API_BASE_URL}/api/tools/autopilot-proposal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${text}` };
    }
    return res.json();
  }

  return {
    ok: false,
    error: `Unknown tool '${fnName}' on Gemini Live`,
  };
}

export async function handleGeminiToolCall(
  session: GeminiLiveSession,
  toolCall: GeminiToolCall
): Promise<void> {
  const functionCall = toolCall.functionCalls?.[0];
  if (!functionCall || !functionCall.name) return;

  const fnName = functionCall.name;
  const fnId = functionCall.id;
  const args = functionCall.args ?? {};

  const result = await callBackendTool(fnName, args);

  session.sendToolResponse({
    toolResponse: {
      functionResponses: [
        {
          name: fnName,
          response: result,
          id: fnId,
        },
      ],
    },
  });
}
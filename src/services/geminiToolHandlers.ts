
// src/services/geminiToolHandlers.ts
import { recordToolActivity } from "./toolActivityBus";

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

const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000';

async function callBackendTool(
  fnName: string,
  args: Record<string, any> | undefined
): Promise<any> {
  const body = args ?? {};

  // --- UI CONTROL TOOL (Client Side) ---
  if (fnName === "control_app_ui") {
    recordToolActivity({
      provider: "gemini",
      name: fnName,
      status: "ok",
      args: body,
    });
    return { ok: true, message: "UI action dispatched" };
  }

  // --- SESSION TOOLS ---
  if (fnName === "start_trading_session") {
      recordToolActivity({ provider: "gemini", name: fnName, status: "pending", args: body });
      try {
          const res = await fetch(`${API_BASE_URL}/api/session/gameplan`, {
              method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
          });
          const json = await res.json();
          recordToolActivity({ provider: "gemini", name: fnName, status: "ok", args: body });
          
          // Trigger UI navigation via side effect? 
          // Ideally the context updates and UI reacts, but for now we just return the plan text.
          return { message: "Session started. Gameplan created.", gameplan: json.session.gameplan };
      } catch(e) {
          recordToolActivity({ provider: "gemini", name: fnName, status: "error", args: body });
          return { error: "Failed to start session" };
      }
  }

  if (fnName === "end_trading_session") {
      recordToolActivity({ provider: "gemini", name: fnName, status: "pending", args: body });
      // We need sessionId context, assume desk state context injection handled this or default to 'current'
      // Since voice doesn't hold local state easily, we might need to rely on the backend finding active session
      // For now, let's just trigger UI to navigate to debrief
      recordToolActivity({ provider: "gemini", name: fnName, status: "ok", args: body });
      return { message: "Please click 'Generate Debrief' on the Debrief screen." }; // Placeholder until fully wired
  }

  // --- BACKEND TOOLS ---

  if (fnName === "get_chart_playbook") {
    recordToolActivity({
      provider: "gemini",
      name: fnName,
      status: "pending",
      args: body,
    });

    const params = new URLSearchParams();
    if (body.symbol) params.set("symbol", String(body.symbol));
    if (body.timeframe) params.set("timeframe", String(body.timeframe));
    if (body.direction) params.set("direction", String(body.direction));

    const res = await fetch(`${API_BASE_URL}/api/tools/playbooks?${params.toString()}`);
    if (!res.ok) {
      const text = await res.text();
      recordToolActivity({
        provider: "gemini",
        name: fnName,
        status: "error",
        args: body,
        errorMessage: text || `HTTP ${res.status}`,
      });
      return { ok: false, error: `HTTP ${res.status}: ${text}` };
    }
    const json = await res.json();
    recordToolActivity({
      provider: "gemini",
      name: fnName,
      status: "ok",
      args: body,
    });
    return json;
  }

  if (fnName === "log_trade_journal") {
    recordToolActivity({
      provider: "gemini",
      name: fnName,
      status: "pending",
      args: body,
    });

    const res = await fetch(`${API_BASE_URL}/api/tools/journal-entry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      recordToolActivity({
        provider: "gemini",
        name: fnName,
        status: "error",
        args: body,
        errorMessage: text || `HTTP ${res.status}`,
      });
      return { ok: false, error: `HTTP ${res.status}: ${text}` };
    }
    const json = await res.json();
    recordToolActivity({
      provider: "gemini",
      name: fnName,
      status: "ok",
      args: body,
    });
    return json;
  }

  if (fnName === "get_autopilot_proposal") {
    recordToolActivity({
      provider: "gemini",
      name: fnName,
      status: "pending",
      args: body,
    });

    const res = await fetch(`${API_BASE_URL}/api/tools/autopilot-proposal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      recordToolActivity({
        provider: "gemini",
        name: fnName,
        status: "error",
        args: body,
        errorMessage: text || `HTTP ${res.status}`,
      });
      return { ok: false, error: `HTTP ${res.status}: ${text}` };
    }
    const json = await res.json();
    recordToolActivity({
      provider: "gemini",
      name: fnName,
      status: "ok",
      args: body,
    });
    return json;
  }

  // Fallback for desk roundup
  if (fnName === "desk_roundup") {
      recordToolActivity({ provider: "gemini", name: fnName, status: "pending", args: body });
      // Call backend route
      const res = await fetch(`${API_BASE_URL}/api/desk/roundup`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: body.input, deskState: {} }) // deskState mocked for voice tool
      });
      const json = await res.json();
      recordToolActivity({ provider: "gemini", name: fnName, status: "ok", args: body });
      return json;
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

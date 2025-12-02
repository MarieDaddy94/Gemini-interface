// src/services/geminiToolHandlers.ts

/**
 * Minimal type for the Gemini Live session we care about.
 * We only need sendToolResponse here.
 */
export type GeminiLiveSession = {
  sendToolResponse: (params: Array<{
    id: string;
    name: string;
    result: any;
  }>) => void;
};

/**
 * Minimal shape for the toolCall object from LiveServerMessage.
 */
export type GeminiToolCall = {
  id: string;
  name: string;
  args: Record<string, any>;
};

const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000';

async function callBackendTool(
  fnName: string,
  args: Record<string, any>
): Promise<any> {
  try {
    if (fnName === "get_chart_playbook") {
      const params = new URLSearchParams();
      if (args.symbol) params.set("symbol", String(args.symbol));
      if (args.timeframe) params.set("timeframe", String(args.timeframe));
      if (args.direction) params.set("direction", String(args.direction));

      const res = await fetch(`${API_BASE_URL}/api/tools/playbooks?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      return await res.json();
    } 
    
    if (fnName === "log_trade_journal") {
      const res = await fetch(`${API_BASE_URL}/api/tools/journal-entry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      return await res.json();
    }

    return { error: `Unknown tool name '${fnName}'` };
  } catch (err: any) {
    console.error(`Error calling tool ${fnName}:`, err);
    return {
      error: `Failed to call backend tool '${fnName}': ${
        err?.message ?? String(err)
      }`,
    };
  }
}

/**
 * Execute a specific Gemini tool call and send response back to session.
 */
export async function handleGeminiToolCall(
  session: GeminiLiveSession,
  call: GeminiToolCall
): Promise<void> {
  const result = await callBackendTool(call.name, call.args);

  // Send the tool response back to the model
  session.sendToolResponse([
    {
      id: call.id,
      name: call.name,
      result: result,
    }
  ]);
}

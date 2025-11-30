export type UIRole = "system" | "user" | "assistant";

export interface UIMessage {
  role: UIRole;
  content: string;
}

export interface VisionImagePayload {
  mimeType: string; // e.g. "image/jpeg"
  data: string;     // base64 WITHOUT "data:" prefix
}

export interface SendAgentChatOptions {
  visionImages?: VisionImagePayload[];
  accountId?: string;
  symbol?: string;
}

export interface AgentChatResponse {
  provider: "openai" | "gemini";
  model: string;
  messages: UIMessage[]; // original + final assistant message
  finalText: string;     // what you show in the chat bubble
  toolResults: { toolName: string; args: any; result: any }[];
  rawResponse: any;
}

export type AgentId =
  | "quant-bot"
  | "pattern-seer"
  | "macro-mind"
  | "risk-guardian"
  | "trade-coach";

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000';

export async function sendAgentChat(
  agentId: AgentId | string, // string allows for flexibility if new agents added
  messages: UIMessage[],
  options: SendAgentChatOptions = {}
): Promise<AgentChatResponse> {
  const res = await fetch(`${API_BASE}/api/agents/${agentId}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages,
      visionImages: options.visionImages,
      accountId: options.accountId,
      symbol: options.symbol,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Agent chat error: ${res.status} ${text}`);
  }

  const data = (await res.json()) as AgentChatResponse;
  return data;
}
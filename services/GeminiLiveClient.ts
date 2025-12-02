
const LIVE_WS_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

export type GeminiLiveToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
};

export type GeminiLiveToolResponse = {
  id: string;
  name: string;
  result: unknown;
};

export type GeminiLiveEvent =
  | { type: "open" }
  | { type: "close"; code: number; reason: string }
  | { type: "error"; error: any }
  | { type: "text"; text: string; isFinal?: boolean }
  | { type: "tool_call"; calls: GeminiLiveToolCall[] }
  | { type: "raw"; data: any };

export interface GeminiLiveClientOptions {
  onEvent?: (evt: GeminiLiveEvent) => void;
  systemPrompt?: string;
}

export class GeminiLiveClient {
  private ws: WebSocket | null = null;
  private options: GeminiLiveClientOptions;

  constructor(options: GeminiLiveClientOptions = {}) {
    this.options = options;
  }

  private emit(evt: GeminiLiveEvent) {
    this.options.onEvent?.(evt);
  }

  async connect() {
    // 1) Ask backend for an ephemeral token
    const API_BASE_URL =
      (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000';

    const tokenRes = await fetch(`${API_BASE_URL}/api/gemini/live/ephemeral-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      throw new Error(
        `Failed to get Gemini ephemeral token: ${tokenRes.status} ${text}`
      );
    }

    const { token } = await tokenRes.json();

    // 2) Open websocket with token as x-goog-api-key query param
    const url = `${LIVE_WS_URL}?key=${encodeURIComponent(token)}`;
    this.ws = new WebSocket(url);

    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = () => {
      this.emit({ type: "open" });
      this.sendSetup();
    };

    this.ws.onclose = (evt) => {
      this.emit({
        type: "close",
        code: evt.code,
        reason: evt.reason,
      });
    };

    this.ws.onerror = (err) => {
      this.emit({ type: "error", error: err });
    };

    this.ws.onmessage = (evt) => {
      if (evt.data instanceof ArrayBuffer || evt.data instanceof Blob) {
        // This will be audio bytes when using native audio models.
        this.emit({ type: "raw", data: evt.data });
        return;
      }

      try {
        const json = JSON.parse(evt.data as string);
        this.handleServerMessage(json);
      } catch (e) {
        console.warn("[GeminiLiveClient] Non-JSON message:", evt.data);
      }
    };
  }

  private send(obj: any) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(obj));
  }

  private sendSetup() {
    const setup = {
      setup: {
        model: "models/gemini-2.0-flash-exp",
        generationConfig: {
          responseModalities: ["AUDIO", "TEXT"],
          maxOutputTokens: 1024,
          temperature: 0.3,
        },
        systemInstruction: {
          parts: [{
            text: this.options.systemPrompt ??
              "You are the lead AI in a multi-agent trading squad. You MUST use tools when you need live trading context or when the user asks you to validate or execute a trade. Never guess account numbers or balances."
          }]
        },
        tools: [
          {
            functionDeclarations: [
              {
                name: 'get_trading_context',
                description:
                  'Get the latest trading context: connected broker snapshot, current equity, open positions, journal stats, and app mode (sim/live).',
                parameters: {
                  type: 'object',
                  properties: {
                    scope: {
                      type: 'string',
                      enum: ['minimal', 'full'],
                      description:
                        'How much context to fetch. "minimal" = just equity + open trades. "full" = include journal stats and recent trade history.',
                    },
                  },
                  required: ['scope'],
                },
              },
              {
                name: 'run_autopilot_review',
                description:
                  'Given a proposed trade from the squad, call the backend risk engine to evaluate if it passes risk rules and return a structured verdict.',
                parameters: {
                  type: 'object',
                  properties: {
                    symbol: {
                      type: 'string',
                      description: 'Symbol to trade, e.g. US30, NAS100, XAUUSD.',
                    },
                    side: {
                      type: 'string',
                      enum: ['buy', 'sell'],
                      description: 'Direction of the trade.',
                    },
                    entry: {
                      type: 'number',
                      description: 'Planned entry price.',
                    },
                    stopLoss: {
                      type: 'number',
                      description: 'Stop loss price.',
                    },
                    takeProfit: {
                      type: 'number',
                      description: 'Take profit price or first target.',
                    },
                    riskPct: {
                      type: 'number',
                      description: 'Percent of account equity to risk on this trade (0–100).',
                    },
                    timeFrame: {
                      type: 'string',
                      description: 'Primary timeframe used for this setup, e.g. 1m, 15m, 1h.',
                    },
                    reasoningSummary: {
                      type: 'string',
                      description:
                        'Short natural-language summary of why this trade makes sense (pattern, liquidity, narrative).',
                    },
                  },
                  required: ['symbol', 'side', 'entry', 'stopLoss', 'riskPct'],
                },
              },
            ],
          },
        ],
      },
    };

    this.send(setup);
  }

  /**
   * Send a user text message into the live session.
   */
  sendText(text: string, endOfTurn = true) {
    const msg = {
      clientContent: {
        turns: [
          {
            role: "user",
            parts: [{ text }],
          },
        ],
        turnComplete: endOfTurn
      },
    };

    this.send(msg);
  }

  /**
   * Send tool responses back to Gemini.
   */
  sendToolResponse(responses: GeminiLiveToolResponse[]) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (!responses.length) return;

    const payload = {
      toolResponse: {
        functionResponses: responses.map((r) => ({
          id: r.id,
          name: r.name,
          response: r.result,
        })),
      },
    };

    this.send(payload);
  }

  private handleServerMessage(msg: any) {
    if (msg.serverContent) {
        const serverContent = msg.serverContent;
        if (serverContent.modelTurn && serverContent.modelTurn.parts) {
            for (const part of serverContent.modelTurn.parts) {
                if (part.text) {
                    const isFinal = !!serverContent.turnComplete;
                    this.emit({ type: "text", text: part.text, isFinal });
                }
            }
        }
        return;
    }

    if (msg.toolCall) {
      const toolCall = msg.toolCall;
      const functionCalls = Array.isArray(toolCall.functionCalls)
        ? toolCall.functionCalls
        : [];

      const calls: GeminiLiveToolCall[] = functionCalls.map((fc: any) => ({
        id: String(fc.id ?? ''),
        name: String(fc.name ?? ''),
        args: fc.args ?? {},
      }));

      if (calls.length > 0) {
        this.emit({ type: "tool_call", calls });
      }
      return;
    }

    // Fallback
    this.emit({ type: "raw", data: msg });
  }

  close() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    this.ws = null;
  }
}

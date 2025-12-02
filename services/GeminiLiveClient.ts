
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

type GeminiLiveClientOptions = {
  apiKey?: string;
  model?: string;
  onServerText?: (text: string, isFinal: boolean) => void;
  onSetupComplete?: () => void;
  onError?: (err: unknown) => void;
  onToolCall?: (calls: GeminiLiveToolCall[]) => void | Promise<void>;
};

export class GeminiLiveClient {
  private apiKey?: string;
  private model: string;
  private socket: WebSocket | null = null;

  private onServerText?: (text: string, isFinal: boolean) => void;
  private onSetupComplete?: () => void;
  private onError?: (err: unknown) => void;
  private onToolCall?: (calls: GeminiLiveToolCall[]) => void | Promise<void>;

  constructor(opts: GeminiLiveClientOptions) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? "models/gemini-2.5-flash-live";
    this.onServerText = opts.onServerText;
    this.onSetupComplete = opts.onSetupComplete;
    this.onError = opts.onError;
    this.onToolCall = opts.onToolCall;
  }

  get isConnected() {
    return !!this.socket && this.socket.readyState === WebSocket.OPEN;
  }

  async connect() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return;

    let url = "";
    if (this.apiKey) {
      url = `${LIVE_WS_URL}?key=${this.apiKey}`;
    } else {
      // Fetch ephemeral token from backend
      const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000';
      const tokenRes = await fetch(`${API_BASE_URL}/api/gemini/live/ephemeral-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!tokenRes.ok) {
        const text = await tokenRes.text();
        throw new Error(`Failed to get Gemini ephemeral token: ${tokenRes.status} ${text}`);
      }

      const { token } = await tokenRes.json();
      url = `${LIVE_WS_URL}?key=${encodeURIComponent(token)}`;
    }

    this.socket = new WebSocket(url);

    this.socket.onopen = () => this.sendSetup();
    this.socket.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        this.handleServerMessage(msg);
      } catch (err) {
        this.onError?.(err);
      }
    };
    this.socket.onerror = (evt) => this.onError?.(evt);
    this.socket.onclose = () => {
      this.socket = null;
    };
  }

  close() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.close();
    }
    this.socket = null;
  }

  private sendSetup() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

    const setupPayload = {
      setup: {
        model: this.model,
        generationConfig: {
          candidateCount: 1,
          maxOutputTokens: 1024,
          temperature: 0.3,
          responseModalities: ["AUDIO", "TEXT"],
        },
        systemInstruction: {
          role: "system",
          parts: [
            {
              text:
                "You are a prop-firm style AI trading squad. " +
                "You MUST call tools to get live trading context, recent chart structure, " +
                "playbooks, and to log trades into the journal before suggesting heavy risk. " +
                "Never hallucinate balances or trade history.",
            },
          ],
        },
        tools: [
          {
            functionDeclarations: [
              {
                name: "get_trading_context",
                description:
                  "Fetch latest trading context: equity, open positions, risk limits, journal stats.",
                parameters: {
                  type: "object",
                  properties: {
                    scope: {
                      type: "string",
                      enum: ["minimal", "full"],
                    },
                  },
                  required: ["scope"],
                },
              },
              {
                name: "run_autopilot_review",
                description:
                  "Send a proposed trade to the backend risk engine for approval and adjusted parameters.",
                parameters: {
                  type: "object",
                  properties: {
                    symbol: { type: "string" },
                    side: { type: "string", enum: ["buy", "sell"] },
                    entry: { type: "number" },
                    stopLoss: { type: "number" },
                    takeProfit: { type: "number" },
                    riskPct: { type: "number" },
                    timeFrame: { type: "string" },
                    reasoningSummary: { type: "string" },
                  },
                  required: ["symbol", "side", "entry", "stopLoss", "riskPct"],
                },
              },
              {
                name: "get_chart_playbook",
                description:
                  "Retrieve the trader's saved playbooks for the current symbol/timeframe.",
                parameters: {
                  type: "object",
                  properties: {
                    symbol: {
                      type: "string",
                      description: "Symbol, e.g. US30, NAS100, XAUUSD.",
                    },
                    timeframe: {
                      type: "string",
                      description: "Timeframe string, e.g. '1m', '5m', '15m'.",
                    },
                    limit: {
                      type: "number",
                      description: "Max number of playbooks to fetch (default 5).",
                    },
                  },
                  required: ["symbol"],
                },
              },
              {
                name: "log_trade_journal",
                description:
                  "Log a trade (real or simulated) into the auto-journal so future coaching can reference it.",
                parameters: {
                  type: "object",
                  properties: {
                    symbol: { type: "string" },
                    direction: {
                      type: "string",
                      enum: ["long", "short"],
                    },
                    result: {
                      type: "string",
                      enum: ["win", "loss", "breakeven", "open"],
                    },
                    rMultiple: { type: "number" },
                    pnl: { type: "number" },
                    environment: {
                      type: "string",
                      enum: ["SIM", "LIVE"],
                    },
                    timeframe: { type: "string" },
                    notes: { type: "string" },
                    source: {
                      type: "string",
                      enum: ["autopilot", "manual", "voice"],
                    },
                    meta: { type: "object" },
                  },
                  required: ["symbol", "direction", "environment", "timeframe"],
                },
              },
              {
                name: "get_recent_vision_summary",
                description:
                  "Get a stitched summary of the last few days of chart vision for the symbol/timeframe.",
                parameters: {
                  type: "object",
                  properties: {
                    symbol: {
                      type: "string",
                      description: "Symbol, e.g. US30, NAS100.",
                    },
                    timeframe: {
                      type: "string",
                      description: "Timeframe string, e.g. '1m', '15m'.",
                    },
                    days: {
                      type: "number",
                      description:
                        "How many days of history to summarize (default 3).",
                    },
                  },
                  required: ["symbol"],
                },
              },
            ],
          },
        ],
      },
    };

    this.socket.send(JSON.stringify(setupPayload));
  }

  sendUserText(text: string, endOfTurn = true) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    const payload = {
      clientContent: {
        turns: [
          {
            role: "user",
            parts: [{ text }],
          },
        ],
        turnComplete: endOfTurn,
      },
    };
    this.socket.send(JSON.stringify(payload));
  }

  sendRealtimeText(textChunk: string) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    const payload = {
      realtimeInput: {
        text: textChunk,
      },
    };
    this.socket.send(JSON.stringify(payload));
  }

  /**
   * Send a chunk of 16-bit PCM mono audio at 16kHz.
   * This wraps it in realtimeInput.mediaChunks with mimeType audio/pcm;rate=16000
   */
  sendRealtimeAudio(pcm16: Int16Array) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    if (!pcm16.length) return;

    const bytes = new Uint8Array(pcm16.buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    const payload = {
      realtimeInput: {
        mediaChunks: [
          {
            mimeType: "audio/pcm;rate=16000",
            data: base64,
          },
        ],
      },
    };

    this.socket.send(JSON.stringify(payload));
  }

  sendToolResponse(responses: GeminiLiveToolResponse[]) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
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

    this.socket.send(JSON.stringify(payload));
  }

  private handleServerMessage(msg: any) {
    if (msg.setupComplete) {
      this.onSetupComplete?.();
      return;
    }

    if (msg.serverContent) {
      const sc = msg.serverContent;
      const mt = sc.modelTurn;
      if (mt && Array.isArray(mt.parts)) {
        let text = "";
        for (const part of mt.parts) {
          if (typeof part.text === "string") text += part.text;
          // NOTE: audio output is ignored for now; we only show text.
        }
        if (text) {
          const isFinal = !!sc.turnComplete || !!sc.generationComplete;
          this.onServerText?.(text, isFinal);
        }
      }
      return;
    }

    if (msg.toolCall) {
      const fc = Array.isArray(msg.toolCall.functionCalls)
        ? msg.toolCall.functionCalls
        : [];
      const calls: GeminiLiveToolCall[] = fc.map((c: any) => ({
        id: String(c.id ?? ""),
        name: String(c.name ?? ""),
        args: c.args ?? {},
      }));
      if (calls.length && this.onToolCall) {
        void this.onToolCall(calls);
      }
      return;
    }
  }
}

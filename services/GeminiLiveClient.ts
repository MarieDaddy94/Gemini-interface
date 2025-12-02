
const LIVE_WS_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

export type GeminiLiveEvent =
  | { type: "open" }
  | { type: "close"; code: number; reason: string }
  | { type: "error"; error: any }
  | { type: "text"; text: string }
  | { type: "tool_call"; toolName: string; args: any }
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
        // For now we just expose it as raw; you can hook it to an AudioContext later.
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
          // You can add temperature, topP, etc.
        },
        // This is where we make it your *trading squad*:
        systemInstruction: {
          parts: [{
            text: this.options.systemPrompt ??
              "You are an AI trading co-pilot specialized in US30/NAS100/XAU, risk-managed prop firm style. You speak briefly and always consider account risk and daily drawdown before suggesting trades."
          }]
        },
        tools: [
          // We’ll wire tools later (get_account_snapshot, run_autopilot_review, etc).
        ],
      },
    };

    this.send(setup);
  }

  /**
   * Send a user text message into the live session.
   */
  sendText(text: string) {
    const msg = {
      clientContent: {
        turns: [
          {
            role: "user",
            parts: [{ text }],
          },
        ],
        turnComplete: true
      },
    };

    this.send(msg);
  }

  /**
   * Placeholder for audio frames (16-bit PCM, 16kHz mono).
   * Once you wire Web Audio to capture PCM16, you can send chunks here:
   */
  sendAudioPcm16(chunk: ArrayBuffer) {
    // Helper to convert array buffer to base64 in browser
    let binary = '';
    const bytes = new Uint8Array(chunk);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const b64 = window.btoa(binary);

    const msg = {
      realtimeInput: {
        mediaChunks: [
          {
            data: b64,
            mimeType: "audio/pcm;rate=16000",
          },
        ],
      },
    };
    this.send(msg);
  }

  private handleServerMessage(msg: any) {
    // Server messages have exactly one of: toolCall, candidate, serverContent, etc. 
    if (msg.toolCall) {
      const { name, args } = msg.toolCall;
      this.emit({ type: "tool_call", toolName: name, args });
      return;
    }

    if (msg.serverContent) {
        if (msg.serverContent.modelTurn && msg.serverContent.modelTurn.parts) {
            for (const part of msg.serverContent.modelTurn.parts) {
                if (part.text) {
                    this.emit({ type: "text", text: part.text });
                }
            }
        }
        return;
    }

    // Fallback: just bubble up raw if it has content we haven't handled specifically
    this.emit({ type: "raw", data: msg });
  }

  close() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
  }
}

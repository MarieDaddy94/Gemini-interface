
import { voiceBus } from "./voiceBus";
import { Tool } from "@google/genai";

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
  voiceName?: string;
  tools?: Tool[];
  systemInstruction?: string;
};

type LiveEventListener = (event: string, data: any) => void;

export class GeminiLiveClient {
  private apiKey?: string;
  private model: string;
  private voiceName: string;
  private tools: Tool[];
  private systemInstruction: string;
  private socket: WebSocket | null = null;
  private listeners: Set<LiveEventListener> = new Set();

  constructor(opts: GeminiLiveClientOptions) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? "models/gemini-2.5-flash-live";
    this.voiceName = opts.voiceName ?? "Aoede";
    this.tools = opts.tools ?? [];
    this.systemInstruction = opts.systemInstruction ?? "You are a helpful AI trading assistant.";
  }

  // Event System
  on(event: string, callback: (data: any) => void) {
    const wrapper = (evt: string, data: any) => {
        if (evt === event) callback(data);
    };
    this.listeners.add(wrapper);
    return () => this.listeners.delete(wrapper);
  }

  private emit(event: string, data: any) {
    this.listeners.forEach(fn => fn(event, data));
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
      const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000';
      const tokenRes = await fetch(`${API_BASE_URL}/api/gemini/live/ephemeral-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!tokenRes.ok) {
        throw new Error(`Failed to get Gemini ephemeral token: ${tokenRes.status}`);
      }

      const { token } = await tokenRes.json();
      url = `${LIVE_WS_URL}?key=${encodeURIComponent(token)}`;
    }

    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
        this.emit('open', {});
        this.sendSetup();
    };
    
    this.socket.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        this.handleServerMessage(msg);
      } catch (err) {
        this.emit('error', err);
      }
    };
    
    this.socket.onerror = (evt) => this.emit('error', evt);
    
    this.socket.onclose = () => {
      this.socket = null;
      this.emit('close', {});
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
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: this.voiceName
              }
            }
          }
        },
        systemInstruction: {
          role: "system",
          parts: [{ text: this.systemInstruction }],
        },
        tools: this.tools,
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
      this.emit('setupComplete', {});
      return;
    }

    if (msg.serverContent) {
      const sc = msg.serverContent;
      const mt = sc.modelTurn;
      if (mt && Array.isArray(mt.parts)) {
        let text = "";
        for (const part of mt.parts) {
          if (typeof part.text === "string") text += part.text;
          
          const inline = part.inlineData;
          if (inline?.mimeType?.startsWith("audio/pcm")) {
            voiceBus.enqueue({
              speakerId: "squad-gemini",
              base64Pcm: inline.data,
              sampleRate: 24000, 
            });
          }
        }
        if (text) {
          const isFinal = !!sc.turnComplete || !!sc.generationComplete;
          this.emit('text', { text, isFinal });
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
      if (calls.length) {
        this.emit('toolCall', calls);
      }
      return;
    }
  }
}

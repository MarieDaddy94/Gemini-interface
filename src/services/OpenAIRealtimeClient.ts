import { voiceBus } from "./voiceBus";

export type OpenAIRealtimeEvents = {
  onText?: (text: string, isFinal: boolean) => void;
  onError?: (err: unknown) => void;
  onOpen?: () => void;
  onClose?: () => void;
};

export class OpenAIRealtimeClient {
  private ws: WebSocket | null = null;
  private url: string;
  private voice: string;
  private instructions: string;
  private events: OpenAIRealtimeEvents;

  constructor(opts: {
    url: string;
    voice: string;
    instructions: string;
    events?: OpenAIRealtimeEvents;
  }) {
    this.url = opts.url;
    this.voice = opts.voice;
    this.instructions = opts.instructions;
    this.events = opts.events ?? {};
  }

  get isConnected() {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

    try {
      this.ws = new WebSocket(this.url);
    } catch (e) {
      this.events.onError?.(e);
      return;
    }

    this.ws.onopen = () => {
      // Configure the session: text + audio, with PCM16 audio output
      const cfg = {
        type: "session.update",
        session: {
          modalities: ["text", "audio"],
          voice: this.voice,
          instructions: this.instructions,
          audio_format: "pcm16",
        },
      };
      this.ws!.send(JSON.stringify(cfg));
      this.events.onOpen?.();
    };

    this.ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);

        // Text chunks
        if (msg.type === "response.delta" && msg.delta?.text) {
          const isFinal = false;
          this.events.onText?.(msg.delta.text, isFinal);
        }

        if (msg.type === "response.completed" && msg.response?.output_text) {
          const txt = msg.response.output_text;
          if (typeof txt === "string" && txt.length) {
            this.events.onText?.(txt, true);
          }
        }

        // Audio chunks (PCM16 base64)
        if (msg.type === "response.audio.delta" && msg.delta?.audio) {
          voiceBus.enqueue({
            speakerId: "squad-openai",
            base64Pcm: msg.delta.audio,
            sampleRate: 24000, // OpenAI Realtime PCM16 sample rate
          });
        }
      } catch (err) {
        this.events.onError?.(err);
      }
    };

    this.ws.onerror = (evt) => {
      this.events.onError?.(evt);
    };

    this.ws.onclose = () => {
      this.ws = null;
      this.events.onClose?.();
    };
  }

  sendUserText(text: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    
    // Standard OpenAI Realtime protocol for text injection
    // We use conversation.item.create followed by response.create
    const itemPayload = {
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: text
          }
        ]
      }
    };
    this.ws.send(JSON.stringify(itemPayload));

    const responsePayload = {
      type: "response.create"
    };
    this.ws.send(JSON.stringify(responsePayload));
  }

  close() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    this.ws = null;
  }
}
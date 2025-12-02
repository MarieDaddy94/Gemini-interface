// src/services/OpenAIRealtimeClient.ts
import { voiceBus } from "./voiceBus";

export type OpenAIRealtimeEvents = {
  onText?: (text: string, isFinal: boolean) => void;
  onError?: (err: unknown) => void;
  onOpen?: () => void;
  onClose?: () => void;
};

export type OpenAIToolSchema = {
  type: "function";
  name: string;
  description: string;
  parameters: any; // JSON schema
};

export type OpenAIToolCallHandler = (
  name: string,
  args: any,
  callId: string
) => void;

export class OpenAIRealtimeClient {
  private ws: WebSocket | null = null;
  private url: string;
  private voice: string;
  private instructions: string;
  private tools: OpenAIToolSchema[];
  private events: OpenAIRealtimeEvents;
  private onToolCall?: OpenAIToolCallHandler;

  constructor(opts: {
    url: string;
    voice: string;
    instructions: string;
    tools?: OpenAIToolSchema[];
    events?: OpenAIRealtimeEvents;
    onToolCall?: OpenAIToolCallHandler;
  }) {
    this.url = opts.url;
    this.voice = opts.voice;
    this.instructions = opts.instructions;
    this.tools = opts.tools ?? [];
    this.events = opts.events ?? {};
    this.onToolCall = opts.onToolCall;
  }

  get isConnected() {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      // Configure the session: text + audio + tools
      const cfg: any = {
        type: "session.update",
        session: {
          modalities: ["text", "audio"],
          voice: this.voice,
          instructions: this.instructions,
          audio_format: "pcm16",
        },
      };

      if (this.tools.length > 0) {
        cfg.session.tools = this.tools;
        cfg.session.tool_choice = "auto";
      }

      this.ws!.send(JSON.stringify(cfg));
      this.events.onOpen?.();
    };

    this.ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);

        // Text deltas
        if (msg.type === "response.delta" && msg.delta?.text) {
          const isFinal = false;
          this.events.onText?.(msg.delta.text, isFinal);
        }

        // Final text
        if (
          msg.type === "response.completed" &&
          msg.response?.output_text &&
          typeof msg.response.output_text === "string"
        ) {
          this.events.onText?.(msg.response.output_text, true);
        }

        // Audio chunks (PCM16 base64)
        if (msg.type === "response.audio.delta" && msg.delta?.audio) {
          voiceBus.enqueue({
            speakerId: "squad-openai",
            base64Pcm: msg.delta.audio,
            sampleRate: 24000,
          });
        }

        // Tool calls
        if (msg.type === "response.output_item.done") {
          const item = msg.item;
          if (item && item.type === "function_call") {
            const name: string = item.name;
            const callId: string = item.call_id;
            const argStr: string = item.arguments || "{}";

            let args: any = {};
            try {
              args = JSON.parse(argStr);
            } catch {
              args = {};
            }

            if (this.onToolCall) {
              this.onToolCall(name, args, callId);
            }
          }
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
    const payload = {
      type: "input_text",
      text,
    };
    this.ws.send(JSON.stringify(payload));
  }

  /**
   * Send the result of a tool call back to the model, then trigger a new response.
   */
  sendToolResult(callId: string, output: any) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const outStr = JSON.stringify(output ?? {});

    // 1) Provide tool output
    this.ws.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: outStr,
        },
      })
    );

    // 2) Ask the model to continue the response with that tool output
    this.ws.send(
      JSON.stringify({
        type: "response.create",
      })
    );
  }

  close() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    this.ws = null;
  }
}
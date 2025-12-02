
import { SquadRole } from "../config/squadVoices";

export type SpeakerId = SquadRole | "squad-gemini" | "squad-openai";

export interface VoiceChunk {
  speakerId: SpeakerId;
  base64Pcm: string;
  sampleRate: number; // e.g. 16000, 24000
}

type ActivityListener = (speakerId: SpeakerId | null) => void;

export class VoiceBus {
  private audioCtx: AudioContext | null = null;
  private queue: { speakerId: SpeakerId; data: Float32Array; sampleRate: number }[] = [];
  private playing = false;
  private listeners: Set<ActivityListener> = new Set();

  private ensureContext(sampleRate: number) {
    if (!this.audioCtx || this.audioCtx.state === "closed") {
      this.audioCtx = new (window.AudioContext ||
        (window as any).webkitAudioContext)({
        sampleRate,
      });
    } else if (this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }
  }

  addActivityListener(fn: ActivityListener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notifyActive(speakerId: SpeakerId | null) {
    for (const fn of this.listeners) {
      fn(speakerId);
    }
  }

  enqueue(chunk: VoiceChunk) {
    const { speakerId, base64Pcm, sampleRate } = chunk;
    if (!base64Pcm) return;

    this.ensureContext(sampleRate);
    
    const binary = atob(base64Pcm);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    this.queue.push({ speakerId, data: float32, sampleRate });
    if (!this.playing) this.playNext();
  }

  private playNext() {
    if (!this.audioCtx) return;

    const next = this.queue.shift();
    if (!next) {
      this.playing = false;
      this.notifyActive(null);
      return;
    }

    this.playing = true;
    const { speakerId, data, sampleRate } = next;

    // If sampleRate changes significantly, we might need a new context or resampling.
    // For now, assuming relatively compatible context or recreating.
    if (this.audioCtx.sampleRate !== sampleRate) {
      // Basic support: If mismatch is large, recreating context is safest but heavyweight.
      // Re-using context is preferred if sample rates match or browser handles resampling.
      // For this demo, we'll try to stick to one context or recreate if closed.
    }

    this.notifyActive(speakerId);

    const buffer = this.audioCtx.createBuffer(1, data.length, sampleRate);
    buffer.getChannelData(0).set(data);

    const src = this.audioCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.audioCtx.destination);
    src.onended = () => this.playNext();
    src.start();
  }

  stop() {
    this.queue = [];
    this.playing = false;
    this.notifyActive(null);
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
  }
}

export const voiceBus = new VoiceBus();

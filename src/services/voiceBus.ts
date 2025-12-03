
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
  private currentSource: AudioBufferSourceNode | null = null;
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

    this.notifyActive(speakerId);

    const buffer = this.audioCtx.createBuffer(1, data.length, sampleRate);
    buffer.getChannelData(0).set(data);

    const src = this.audioCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.audioCtx.destination);
    
    this.currentSource = src;
    
    src.onended = () => {
        this.currentSource = null;
        this.playNext();
    };
    src.start();
  }

  stop() {
    // Kill queue
    this.queue = [];
    
    // Stop current audio
    if (this.currentSource) {
        try { this.currentSource.stop(); } catch(e) {}
        this.currentSource = null;
    }
    
    this.playing = false;
    this.notifyActive(null);
  }
}

export const voiceBus = new VoiceBus();


import { SQUAD_VOICES, SquadRole } from "../config/squadVoices";
import { voiceBus } from "./voiceBus";

const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000';

export async function speakAgentLine(
  role: SquadRole,
  text: string,
  forceProvider?: "gemini" | "openai"
) {
  const profile = SQUAD_VOICES[role];
  const provider = forceProvider || profile.provider;

  try {
    if (provider === "gemini") {
      const res = await fetch(`${API_BASE_URL}/api/gemini/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          voicePreset: profile.geminiPreset,
        }),
      });
      
      if (!res.ok) throw new Error("Gemini TTS failed");
      
      const json = await res.json();
      if (json.base64Pcm) {
        voiceBus.enqueue({
          speakerId: role,
          base64Pcm: json.base64Pcm,
          sampleRate: json.sampleRate ?? 24000,
        });
      }
    } else {
      const res = await fetch(`${API_BASE_URL}/api/openai/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          voice: profile.openaiVoice,
        }),
      });

      if (!res.ok) throw new Error("OpenAI TTS failed");

      const json = await res.json();
      if (json.base64Pcm) {
        voiceBus.enqueue({
          speakerId: role,
          base64Pcm: json.base64Pcm,
          sampleRate: json.sampleRate ?? 24000,
        });
      }
    }
  } catch (e) {
    console.error(`Failed to speak agent line (${role}):`, e);
  }
}

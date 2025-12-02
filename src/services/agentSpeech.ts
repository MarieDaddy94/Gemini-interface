
import { voiceBus } from "./voiceBus";
import { apiClient } from "../utils/apiClient";
import type { VoiceProfile } from "../config/squadVoices";

export async function speakAgentLine(
  roleLabel: string,
  text: string,
  profile: VoiceProfile
) {
  const provider = profile.provider;

  try {
    let json: any;
    
    if (provider === "gemini") {
      json = await apiClient.post<{ base64Pcm: string, sampleRate: number }>('/api/gemini/tts', {
        text,
        voicePreset: profile.geminiPreset,
      });
    } else {
      json = await apiClient.post<{ base64Pcm: string, sampleRate: number }>('/api/openai/tts', {
        text,
        voice: profile.openaiVoice,
      });
    }

    if (json.base64Pcm) {
      voiceBus.enqueue({
        speakerId: roleLabel as any,
        base64Pcm: json.base64Pcm,
        sampleRate: json.sampleRate ?? 24000,
      });
    }
  } catch (e) {
    // We already log in apiClient, but here we might want to just suppress UI alerts for TTS failure
    console.warn(`Failed to speak agent line (${roleLabel})`, e);
  }
}

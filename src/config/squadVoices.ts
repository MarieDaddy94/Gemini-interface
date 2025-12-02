
export type SquadRole =
  | "strategist"
  | "risk"
  | "quant"
  | "execution"
  | "journal";

export type VoiceProvider = "gemini" | "openai";

export interface VoiceProfile {
  provider: VoiceProvider;
  geminiPreset?: string;
  openaiVoice?: string;
}

export const SQUAD_VOICES: Record<SquadRole, VoiceProfile> = {
  strategist: {
    provider: "gemini",
    geminiPreset: "en-US-Standard-A",
    openaiVoice: "alloy",
  },
  risk: {
    provider: "gemini",
    geminiPreset: "en-US-Standard-B",
    openaiVoice: "verse",
  },
  quant: {
    provider: "gemini",
    geminiPreset: "en-US-Standard-C",
    openaiVoice: "sage",
  },
  execution: {
    provider: "gemini",
    geminiPreset: "en-US-Standard-D",
    openaiVoice: "onyx",
  },
  journal: {
    provider: "gemini",
    geminiPreset: "en-US-Neutral",
    openaiVoice: "nova",
  },
};

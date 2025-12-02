import type { SquadRole, VoiceProfile } from "./squadVoices";

export type VoiceTheme = "serious" | "chill" | "hype";

export const VOICE_THEMES: Record<VoiceTheme, Record<SquadRole, VoiceProfile>> = {
  serious: {
    strategist: {
      provider: "gemini",
      geminiPreset: "Aoede",
      openaiVoice: "alloy", // calm, neutral
    },
    risk: {
      provider: "gemini",
      geminiPreset: "Charon",
      openaiVoice: "onyx", // authoritative
    },
    quant: {
      provider: "gemini",
      geminiPreset: "Fenrir",
      openaiVoice: "sage", // analytical
    },
    execution: {
      provider: "gemini",
      geminiPreset: "Puck",
      openaiVoice: "alloy",
    },
    journal: {
      provider: "gemini",
      geminiPreset: "Kore",
      openaiVoice: "nova",
    },
  },

  chill: {
    strategist: {
      provider: "gemini",
      geminiPreset: "Kore",
      openaiVoice: "breeze",
    },
    risk: {
      provider: "gemini",
      geminiPreset: "Aoede",
      openaiVoice: "juniper",
    },
    quant: {
      provider: "gemini",
      geminiPreset: "Fenrir",
      openaiVoice: "cove",
    },
    execution: {
      provider: "gemini",
      geminiPreset: "Puck",
      openaiVoice: "breeze",
    },
    journal: {
      provider: "gemini",
      geminiPreset: "Aoede",
      openaiVoice: "ember",
    },
  },

  hype: {
    strategist: {
      provider: "gemini",
      geminiPreset: "Puck",
      openaiVoice: "shimmer",
    },
    risk: {
      provider: "gemini",
      geminiPreset: "Fenrir",
      openaiVoice: "echo",
    },
    quant: {
      provider: "gemini",
      geminiPreset: "Aoede",
      openaiVoice: "nova",
    },
    execution: {
      provider: "gemini",
      geminiPreset: "Charon",
      openaiVoice: "fable",
    },
    journal: {
      provider: "gemini",
      geminiPreset: "Kore",
      openaiVoice: "shimmer",
    },
  },
};

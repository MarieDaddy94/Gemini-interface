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

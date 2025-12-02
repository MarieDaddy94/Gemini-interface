import React, { createContext, useContext, useState, useMemo } from "react";
import type { SquadRole, VoiceProfile } from "../config/squadVoices";
import { VOICE_THEMES, VoiceTheme } from "../config/voiceThemes";

export type RealtimeProvider = "gemini" | "openai";

type RealtimeConfigState = {
  provider: RealtimeProvider;
  setProvider: (p: RealtimeProvider) => void;

  theme: VoiceTheme;
  setTheme: (t: VoiceTheme) => void;

  getVoiceProfile: (role: SquadRole) => VoiceProfile;
};

const RealtimeConfigContext = createContext<RealtimeConfigState | null>(null);

export const RealtimeConfigProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [provider, setProvider] = useState<RealtimeProvider>("gemini");
  const [theme, setTheme] = useState<VoiceTheme>("serious");

  const value = useMemo<RealtimeConfigState>(
    () => ({
      provider,
      setProvider,
      theme,
      setTheme,
      getVoiceProfile: (role: SquadRole): VoiceProfile => {
        const themeMap = VOICE_THEMES[theme];
        const base = themeMap[role];
        // Always return some profile
        return base ?? {
          provider: "gemini",
          geminiPreset: "Aoede",
          openaiVoice: "alloy",
        };
      },
    }),
    [provider, theme]
  );

  return (
    <RealtimeConfigContext.Provider value={value}>
      {children}
    </RealtimeConfigContext.Provider>
  );
};

export const useRealtimeConfig = (): RealtimeConfigState => {
  const ctx = useContext(RealtimeConfigContext);
  if (!ctx) {
    throw new Error("useRealtimeConfig must be used inside RealtimeConfigProvider");
  }
  return ctx;
};

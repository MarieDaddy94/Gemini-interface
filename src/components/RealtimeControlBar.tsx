import React from "react";
import { useRealtimeConfig, RealtimeProvider } from "../context/RealtimeConfigContext";
import { useVoiceActivity } from "../context/VoiceActivityContext";
import type { VoiceTheme } from "../config/voiceThemes";

const providerLabels: Record<RealtimeProvider, string> = {
  gemini: "Gemini",
  openai: "OpenAI",
};

const themeLabels: Record<VoiceTheme, string> = {
  serious: "Serious",
  chill: "Chill",
  hype: "Hype",
};

const RealtimeControlBar: React.FC = () => {
  const { provider, setProvider, theme, setTheme } = useRealtimeConfig();
  const { activeSpeaker } = useVoiceActivity();

  return (
    <div className="flex items-center justify-between px-2 py-1 text-[11px] bg-black/60 border-b border-white/10">
      {/* Model toggle */}
      <div className="flex items-center gap-1">
        <span className="opacity-70 mr-1">Model:</span>
        {(Object.keys(providerLabels) as RealtimeProvider[]).map((p) => (
          <button
            key={p}
            onClick={() => setProvider(p)}
            className={
              "px-2 py-0.5 rounded border text-[10px] " +
              (provider === p
                ? "bg-emerald-600/80 border-emerald-400 text-white"
                : "bg-black/50 border-white/20 text-gray-400 hover:text-white")
            }
          >
            {providerLabels[p]}
          </button>
        ))}
      </div>

      {/* Theme toggle */}
      <div className="flex items-center gap-1">
        <span className="opacity-70 mr-1">Voice:</span>
        {(Object.keys(themeLabels) as VoiceTheme[]).map((t) => (
          <button
            key={t}
            onClick={() => setTheme(t)}
            className={
              "px-2 py-0.5 rounded border text-[10px] " +
              (theme === t
                ? "bg-blue-600/80 border-blue-400 text-white"
                : "bg-black/50 border-white/20 text-gray-400 hover:text-white")
            }
          >
            {themeLabels[t]}
          </button>
        ))}
      </div>

      {/* Activity indicator */}
      <div className="flex items-center gap-1">
        <span className="opacity-70">
          {activeSpeaker ? `Speaking: ${activeSpeaker}` : "Silent"}
        </span>
        {activeSpeaker && (
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        )}
      </div>
    </div>
  );
};

export default RealtimeControlBar;

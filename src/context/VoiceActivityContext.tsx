import React, { createContext, useContext, useEffect, useState } from "react";
import { voiceBus, SpeakerId } from "../services/voiceBus";

type VoiceActivityState = {
  activeSpeaker: SpeakerId | null;
};

const VoiceActivityContext = createContext<VoiceActivityState>({
  activeSpeaker: null,
});

export const VoiceActivityProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [activeSpeaker, setActiveSpeaker] = useState<SpeakerId | null>(null);

  useEffect(() => {
    const unsubscribe = voiceBus.addActivityListener((speaker) => {
      setActiveSpeaker(speaker);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <VoiceActivityContext.Provider value={{ activeSpeaker }}>
      {children}
    </VoiceActivityContext.Provider>
  );
};

export const useVoiceActivity = () => useContext(VoiceActivityContext);
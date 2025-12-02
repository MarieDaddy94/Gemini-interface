import React from "react";
import { useRealtimeConfig } from "../context/RealtimeConfigContext";
import GeminiVoicePanel from "./GeminiVoicePanel";
import OpenAIVoiceAutopilotPanel from "./OpenAIVoiceAutopilotPanel";

const RealtimeSquadPanel: React.FC = () => {
  const { provider } = useRealtimeConfig();

  return (
    <div className="h-full w-full flex flex-col">
      {provider === "gemini" ? (
        <GeminiVoicePanel />
      ) : (
        <OpenAIVoiceAutopilotPanel />
      )}
    </div>
  );
};

export default RealtimeSquadPanel;

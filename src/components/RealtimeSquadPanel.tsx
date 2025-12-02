import React from "react";
import { useRealtimeConfig } from "../context/RealtimeConfigContext";
import GeminiVoicePanel from "./GeminiVoicePanel";
import OpenAIVoiceAutopilotPanel from "./OpenAIVoiceAutopilotPanel";

type Props = {
  openaiRealtimeWsUrl?: string;
};

const RealtimeSquadPanel: React.FC<Props> = ({ openaiRealtimeWsUrl }) => {
  const { provider } = useRealtimeConfig();

  return (
    <div className="h-full w-full flex flex-col">
      {provider === "gemini" ? (
        <GeminiVoicePanel />
      ) : (
        <OpenAIVoiceAutopilotPanel wsUrl={openaiRealtimeWsUrl || ""} />
      )}
    </div>
  );
};

export default RealtimeSquadPanel;
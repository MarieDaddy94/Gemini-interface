
import React from "react";
import { useRealtimeConfig } from "../context/RealtimeConfigContext";
import GeminiVoicePanel from "./GeminiVoicePanel";
import OpenAIVoiceAutopilotPanel from "./OpenAIVoiceAutopilotPanel";
import ToolActivityPanel from "./ToolActivityPanel";

type Props = {
  openaiRealtimeWsUrl?: string;
};

const RealtimeSquadPanel: React.FC<Props> = ({ openaiRealtimeWsUrl }) => {
  const { provider } = useRealtimeConfig();

  return (
    <div className="h-full w-full flex flex-col gap-2">
      <div className="flex-1 min-h-0">
        {provider === "gemini" ? (
          <GeminiVoicePanel />
        ) : (
          <OpenAIVoiceAutopilotPanel wsUrl={openaiRealtimeWsUrl || ""} />
        )}
      </div>
      <div className="shrink-0">
        <ToolActivityPanel />
      </div>
    </div>
  );
};

export default RealtimeSquadPanel;

import React from "react";

const OpenAIVoiceAutopilotPanel: React.FC = () => {
  return (
    <div className="flex flex-col h-full bg-black/60 text-xs text-slate-200 p-3 rounded">
      <div className="font-semibold text-sm mb-2">
        OpenAI Realtime Autopilot
      </div>
      <p className="opacity-70 mb-2">
        This panel is wired into your model/theme toggles but the actual
        OpenAI Realtime voice client is not enabled yet in this build.
      </p>
      <p className="opacity-60">
        For now, you can use the Gemini Live squad for full voice Autopilot.
        We&apos;ll hook this panel to a simple WebSocket-based OpenAI client
        (no <code>@openai/realtime-api-beta</code> import) in the next pass.
      </p>
    </div>
  );
};

export default OpenAIVoiceAutopilotPanel;
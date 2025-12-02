
import React from "react";
import { useToolActivity } from "../context/ToolActivityContext";

const statusColor = (status: string) => {
  switch (status) {
    case "ok":
      return "text-emerald-400";
    case "error":
      return "text-rose-400";
    default:
      return "text-amber-400"; // pending
  }
};

const providerLabel: Record<string, string> = {
  openai: "OpenAI",
  gemini: "Gemini",
};

const ToolActivityPanel: React.FC = () => {
  const { events } = useToolActivity();

  if (!events.length) {
    return (
      <div className="mt-2 rounded border border-white/10 bg-black/40 p-3 text-[10px] text-gray-500 text-center italic">
        Waiting for AI tool usage...
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-1 max-h-48 overflow-y-auto pr-1">
      <div className="text-[10px] uppercase font-bold text-gray-500 px-1 mb-1">
        Live Tools Monitor
      </div>
      {events.map((evt) => (
        <div
          key={evt.id}
          className="rounded border border-gray-800 bg-[#080810] p-2 text-[10px] flex flex-col gap-1 animate-fade-in"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 font-mono text-[9px] uppercase">
                {providerLabel[evt.provider] ?? evt.provider}
              </span>
              <span className={`font-semibold ${statusColor(evt.status)}`}>
                {evt.name}
              </span>
            </div>
            <span className="text-[9px] text-gray-600 font-mono">
              {new Date(evt.ts).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          </div>

          {evt.status === "pending" && (
            <div className="text-amber-500/80 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
              Running...
            </div>
          )}

          {evt.argsSummary && (
            <div className="text-gray-400 font-mono text-[9px] break-all opacity-80 leading-tight">
              {evt.argsSummary}
            </div>
          )}

          {evt.errorMessage && (
            <div className="text-rose-400 bg-rose-900/10 p-1 rounded border border-rose-900/30">
              Error: {evt.errorMessage}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default ToolActivityPanel;

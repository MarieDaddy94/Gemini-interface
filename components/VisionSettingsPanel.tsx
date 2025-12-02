import React from 'react';
import { useVisionSettings } from '../context/VisionSettingsContext';

const VisionSettingsPanel: React.FC = () => {
  const {
    settings,
    setProvider,
    setMode,
    setGeminiModel,
    setOpenAIModel,
  } = useVisionSettings();

  return (
    <div className="flex flex-col gap-3 p-4 rounded-lg bg-[#161a25] border border-[#2a2e39] text-xs text-gray-300">
      <div className="flex justify-between items-center gap-2">
        <span className="font-semibold text-gray-100">Vision Engine</span>
        <select
          className="flex-1 bg-[#101018] border border-gray-700 rounded px-2 py-1 focus:outline-none focus:border-[#2962ff]"
          value={settings.provider}
          onChange={e => setProvider(e.target.value as any)}
        >
          <option value="auto">Auto</option>
          <option value="gemini">Gemini</option>
          <option value="openai">OpenAI</option>
        </select>
      </div>

      <div className="flex justify-between items-center gap-2">
        <span className="font-semibold text-gray-100">Mode</span>
        <select
          className="flex-1 bg-[#101018] border border-gray-700 rounded px-2 py-1 focus:outline-none focus:border-[#2962ff]"
          value={settings.mode}
          onChange={e => setMode(e.target.value as any)}
        >
          <option value="fast">Fast (Flash / 4o)</option>
          <option value="deep">Deep (Gemini 3 / GPT-4.1)</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="font-semibold text-gray-100">Gemini model</label>
        <input
          type="text"
          className="w-full bg-[#101018] border border-gray-700 rounded px-2 py-1 focus:outline-none focus:border-[#2962ff]"
          value={settings.defaultGeminiModel ?? ''}
          onChange={e => setGeminiModel(e.target.value)}
          placeholder="gemini-2.5-flash"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="font-semibold text-gray-100">OpenAI model</label>
        <input
          type="text"
          className="w-full bg-[#101018] border border-gray-700 rounded px-2 py-1 focus:outline-none focus:border-[#2962ff]"
          value={settings.defaultOpenAIModel ?? ''}
          onChange={e => setOpenAIModel(e.target.value)}
          placeholder="gpt-4o-mini"
        />
      </div>

      <div className="opacity-70 text-[10px] mt-1">
        These settings will be used by the Vision agents (Chart Vision, Live Watch,
        Journal Vision) when they ask for screenshots or video analysis.
      </div>
    </div>
  );
};

export default VisionSettingsPanel;
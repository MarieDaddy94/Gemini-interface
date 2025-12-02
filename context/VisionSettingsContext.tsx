
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import type {
  VisionProvider,
  VisionMode,
  VisionSettings,
} from '../types';

interface VisionSettingsContextValue {
  settings: VisionSettings;
  setProvider: (provider: VisionProvider) => void;
  setMode: (mode: VisionMode) => void;
  setGeminiModel: (modelId: string) => void;
  setOpenAIModel: (modelId: string) => void;

  // Derived helpers used by the vision services
  selectedProvider: VisionProvider;
  selectedVisionModelId: string | null;
}

const defaultSettings: VisionSettings = {
  provider: 'auto',
  mode: 'fast',
  defaultGeminiModel: 'gemini-2.5-flash',
  defaultOpenAIModel: 'gpt-4o-mini',
};

const VisionSettingsContext = createContext<VisionSettingsContextValue | undefined>(
  undefined
);

export const VisionSettingsProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [settings, setSettings] = useState<VisionSettings>(defaultSettings);

  const setProvider = useCallback((provider: VisionProvider) => {
    setSettings(prev => ({ ...prev, provider }));
  }, []);

  const setMode = useCallback((mode: VisionMode) => {
    setSettings(prev => ({ ...prev, mode }));
  }, []);

  const setGeminiModel = useCallback((modelId: string) => {
    setSettings(prev => ({ ...prev, defaultGeminiModel: modelId }));
  }, []);

  const setOpenAIModel = useCallback((modelId: string) => {
    setSettings(prev => ({ ...prev, defaultOpenAIModel: modelId }));
  }, []);

  const value = useMemo(() => {
    // Decide which model string we’ll actually use
    let selectedProvider: VisionProvider = settings.provider;
    if (selectedProvider === 'auto') {
      // Simple heuristic: default to Gemini when "auto"
      selectedProvider = 'gemini';
    }

    let selectedVisionModelId: string | null = null;
    if (selectedProvider === 'gemini') {
      selectedVisionModelId = settings.defaultGeminiModel ?? null;
    } else if (selectedProvider === 'openai') {
      selectedVisionModelId = settings.defaultOpenAIModel ?? null;
    }

    return {
      settings,
      setProvider,
      setMode,
      setGeminiModel,
      setOpenAIModel,
      selectedProvider,
      selectedVisionModelId,
    };
  }, [settings, setProvider, setMode, setGeminiModel, setOpenAIModel]);

  return (
    <VisionSettingsContext.Provider value={value}>
      {children}
    </VisionSettingsContext.Provider>
  );
};

export const useVisionSettings = (): VisionSettingsContextValue => {
  const ctx = useContext(VisionSettingsContext);
  if (!ctx) {
    throw new Error('useVisionSettings must be used within VisionSettingsProvider');
  }
  return ctx;
};

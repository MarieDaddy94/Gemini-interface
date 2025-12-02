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
}

const defaultSettings: VisionSettings = {
  provider: 'auto',
  mode: 'fast',
  defaultGeminiModel: 'gemini-2.5-flash',      // tweak if you want
  defaultOpenAIModel: 'gpt-4o-mini',           // tweak if you want
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

  const value = useMemo(
    () => ({
      settings,
      setProvider,
      setMode,
      setGeminiModel,
      setOpenAIModel,
    }),
    [settings, setProvider, setMode, setGeminiModel, setOpenAIModel]
  );

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
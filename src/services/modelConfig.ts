
export type Provider = 'gemini' | 'openai';

export interface ModelAssignment {
  provider: Provider;
  model: string;
}

export interface ModelConfigState {
  // Roles
  strategist: ModelAssignment;
  risk: ModelAssignment;
  quant: ModelAssignment;
  execution: ModelAssignment;
  deskCoordinator: ModelAssignment;
  journalCoach: ModelAssignment;

  // Tasks
  vision: ModelAssignment;
  voice: ModelAssignment; // Determines active Realtime provider
}

const DEFAULT_CONFIG: ModelConfigState = {
  strategist: { provider: 'gemini', model: 'gemini-2.5-flash-thinking' },
  risk: { provider: 'openai', model: 'gpt-4o' },
  quant: { provider: 'gemini', model: 'gemini-2.5-flash' },
  execution: { provider: 'gemini', model: 'gemini-2.5-flash' },
  deskCoordinator: { provider: 'gemini', model: 'gemini-2.5-flash' },
  journalCoach: { provider: 'gemini', model: 'gemini-2.5-flash' },
  vision: { provider: 'gemini', model: 'gemini-2.5-flash' },
  voice: { provider: 'gemini', model: 'gemini-2.5-flash-live' }, // Live uses specific models
};

const STORAGE_KEY = 'ai_model_lab_config_v1';

export class ModelConfigService {
  private config: ModelConfigState;

  constructor() {
    this.config = DEFAULT_CONFIG;
    this.load();
  }

  private load() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.config = { ...DEFAULT_CONFIG, ...parsed };
      }
    } catch (e) {
      console.error('Failed to load model config', e);
    }
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
    } catch (e) {
      console.error('Failed to save model config', e);
    }
  }

  getConfig(): ModelConfigState {
    return this.config;
  }

  updateConfig(updates: Partial<ModelConfigState>) {
    this.config = { ...this.config, ...updates };
    this.save();
  }

  // Helper to get the provider/model pair for a specific purpose
  getAssignment(key: keyof ModelConfigState): ModelAssignment {
    return this.config[key];
  }
}

export const modelConfigService = new ModelConfigService();

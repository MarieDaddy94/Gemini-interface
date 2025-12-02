
import { apiClient } from '../utils/apiClient';

export interface ModelLineup {
    strategist: { provider: string; model: string };
    risk: { provider: string; model: string };
    quant: { provider: string; model: string };
    execution: { provider: string; model: string };
    pattern: { provider: string; model: string };
    journal: { provider: string; model: string };
}

export interface ModelRecommendation {
    role: string;
    action: 'SWAP' | 'UPGRADE';
    from: { provider: string; model: string };
    to: { provider: string; model: string };
    reason: string;
}

export interface ModelPolicy {
    id: string;
    lineup: ModelLineup;
    recommendations: ModelRecommendation[];
}

export interface DeskSession {
    id: string;
    date: string;
    summary: string;
    tags: string;
    stats: {
        totalR: number;
        totalPnl: number;
        tradeCount: number;
    };
}

export const modelLabApi = {
    getActivePolicy: async () => {
        return apiClient.get<ModelPolicy>('/api/model-policy/current');
    },
    getRecommendations: async () => {
        return apiClient.get<{ recommendations: ModelRecommendation[] }>('/api/model-policy/recommendations');
    },
    applyRecommendation: async (rec: ModelRecommendation) => {
        return apiClient.post<ModelPolicy>('/api/model-policy/apply', { recommendation: rec });
    },
    getSessions: async () => {
        return apiClient.get<{ sessions: DeskSession[] }>('/api/session/list');
    },
    generateSessionSummary: async (date: string) => {
        return apiClient.post<{ summary: any }>('/api/session/generate-summary', { date });
    }
};


// src/services/performanceApi.ts
import { apiClient } from '../utils/apiClient';

export interface PlaybookProfile {
  playbook: string;
  symbol: string;
  sampleSize: number;
  winRate: number;
  avgR: number;
  maxDrawdownR: number;
  lastTradeAt: string | null;
  health: 'green' | 'amber' | 'red' | 'gray';
}

export interface DeskInsights {
  green: PlaybookProfile[];
  red: PlaybookProfile[];
}

export const performanceApi = {
  getPlaybooks: async (symbol?: string, lookbackDays?: number): Promise<PlaybookProfile[]> => {
    const params = new URLSearchParams();
    if (symbol) params.append('symbol', symbol);
    if (lookbackDays) params.append('lookbackDays', lookbackDays.toString());
    
    return apiClient.get<PlaybookProfile[]>(`/api/performance/playbooks?${params.toString()}`);
  },

  getDeskInsights: async (symbol?: string): Promise<DeskInsights> => {
    const params = new URLSearchParams();
    if (symbol) params.append('symbol', symbol);
    
    return apiClient.get<DeskInsights>(`/api/performance/desk-insights?${params.toString()}`);
  }
};

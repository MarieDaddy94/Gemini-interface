
import { Playbook, PlaybookStats } from '../types';
import { apiClient } from '../utils/apiClient';

export interface PlaybookFilter {
  symbol?: string;
  timeframe?: string;
  tier?: string;
}

export const playbookApi = {
  fetchPlaybooks: async (filter: PlaybookFilter = {}): Promise<Playbook[]> => {
    return apiClient.post<{ playbooks: Playbook[] }>('/api/playbooks/query', filter).then(r => r.playbooks);
  },

  fetchPlaybook: async (id: string): Promise<Playbook> => {
    return apiClient.get<Playbook>(`/api/playbooks/${encodeURIComponent(id)}`);
  },

  createPlaybook: async (data: Partial<Playbook>): Promise<Playbook> => {
    return apiClient.post<Playbook>('/api/playbooks', data);
  },

  updatePlaybook: async (id: string, patch: Partial<Playbook>): Promise<Playbook> => {
    return apiClient.patch<Playbook>(`/api/playbooks/${encodeURIComponent(id)}`, patch);
  },

  archivePlaybook: async (id: string): Promise<Playbook> => {
    return apiClient.patch<Playbook>(`/api/playbooks/${encodeURIComponent(id)}`, { archived: true });
  },

  refreshStats: async (id: string): Promise<Playbook> => {
    return apiClient.post<Playbook>(`/api/playbooks/${encodeURIComponent(id)}/refresh-stats`, {});
  }
};

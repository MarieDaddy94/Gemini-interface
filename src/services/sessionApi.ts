
import { DeskSession, SessionGameplan, SessionDebrief } from '../types';
import { apiClient } from '../utils/apiClient';

export const sessionApi = {
    createGameplan: async (marketSession: string): Promise<DeskSession> => {
        return apiClient.post<{ session: DeskSession }>('/api/session/gameplan', { marketSession })
            .then(res => res.session);
    },

    generateDebrief: async (sessionId: string): Promise<DeskSession> => {
        return apiClient.post<{ session: DeskSession }>('/api/session/debrief', { sessionId })
            .then(res => res.session);
    }
};

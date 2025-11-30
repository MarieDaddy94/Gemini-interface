import { AiRouteRequest, AiRouteResponse } from '../types';

const API_BASE_URL =
  (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000';

export const sendAiMessage = async (request: AiRouteRequest): Promise<AiRouteResponse> => {
  try {
    const res = await fetch(`${API_BASE_URL}/api/ai/route`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText || `AI Route failed with status ${res.status}`);
    }

    const data = await res.json();
    return data as AiRouteResponse;
  } catch (error) {
    console.error('Error contacting AI Agent:', error);
    throw error;
  }
};

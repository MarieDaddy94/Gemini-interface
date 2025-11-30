import { SessionSummary, ChatMessage } from '../types';

const API_BASE_URL =
  (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000';
const LOG_ENDPOINT = `${API_BASE_URL}/api/playbooks`;

export interface PlaybookLogPayload {
  id: string;
  timestamp: string;
  focusSymbol: string;
  chartContext: string;
  sessionSummary: SessionSummary;
  messages: {
    sender: string;
    text: string;
    isUser: boolean;
  }[];
}

/**
 * Log a Session Playbook to the backend API.
 * If the backend is unreachable, falls back to localStorage so you still get an archive.
 */
export const logSessionPlaybook = async (
  summary: SessionSummary,
  options: {
    focusSymbol: string;
    chartContext: string;
    history: ChatMessage[];
  }
): Promise<void> => {
  const { focusSymbol, chartContext, history } = options;

  const payload: PlaybookLogPayload = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    focusSymbol,
    chartContext,
    sessionSummary: summary,
    messages: history.map((m) => ({
      sender: typeof m.sender === 'string' ? m.sender : String(m.sender),
      text: m.text,
      isUser: m.isUser
    }))
  };

  try {
    const res = await fetch(LOG_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`Playbook log failed with status ${res.status}`);
    }
  } catch (error) {
    console.error('Playbook log API error, falling back to localStorage:', error);
    try {
      const key = 'playbook_logs';
      const existingRaw =
        typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
      const existing: PlaybookLogPayload[] = existingRaw ? JSON.parse(existingRaw) : [];
      existing.push(payload);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(existing));
      }
    } catch (fallbackError) {
      console.error('Playbook local logging failed:', fallbackError);
    }
  }
};

/**
 * Fetch all logged playbooks from backend.
 * If backend fails, falls back to localStorage archive.
 */
export const fetchPlaybookLogs = async (): Promise<PlaybookLogPayload[]> => {
  try {
    const res = await fetch(LOG_ENDPOINT, {
      method: 'GET'
    });

    if (!res.ok) {
      throw new Error(`Fetch logs failed with status ${res.status}`);
    }

    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data as PlaybookLogPayload[];
  } catch (error) {
    console.error('Playbook fetch API error, falling back to localStorage:', error);
    try {
      const key = 'playbook_logs';
      const existingRaw =
        typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
      const existing: PlaybookLogPayload[] = existingRaw ? JSON.parse(existingRaw) : [];
      return existing;
    } catch (fallbackError) {
      console.error('Playbook local fetch failed:', fallbackError);
      return [];
    }
  }
};
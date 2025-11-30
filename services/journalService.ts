import {
  JournalEntry,
  NewJournalEntryInput,
  JournalEntryPatch
} from '../types';

const API_BASE_URL =
  (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000';

export const fetchJournalEntries = async (
  sessionId: string
): Promise<JournalEntry[]> => {
  const res = await fetch(
    `${API_BASE_URL}/api/journal/entries?sessionId=${encodeURIComponent(
      sessionId
    )}`,
    {
      method: 'GET',
      credentials: 'include'
    }
  );

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || 'Failed to fetch journal entries');
  }

  const data = (await res.json()) as JournalEntry[];
  return data;
};

export const createJournalEntry = async (
  sessionId: string,
  entry: NewJournalEntryInput
): Promise<JournalEntry> => {
  const res = await fetch(`${API_BASE_URL}/api/journal/entry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ sessionId, entry })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || 'Failed to create journal entry');
  }

  const data = (await res.json()) as JournalEntry;
  return data;
};

export const updateJournalEntry = async (
  sessionId: string,
  id: string,
  updates: JournalEntryPatch
): Promise<JournalEntry> => {
  const res = await fetch(`${API_BASE_URL}/api/journal/entry/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ sessionId, updates })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || 'Failed to update journal entry');
  }

  const data = (await res.json()) as JournalEntry;
  return data;
};
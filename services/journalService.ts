import {
  JournalEntry,
  NewJournalEntryInput,
  TagSummary,
  SymbolSummaryForTag,
  TradeOutcome
} from '../types';

const STORAGE_KEY_PREFIX = 'ai-trading-analyst-journal-';
const API_BASE_URL =
  (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000';

function getStorageKey(sessionId: string): string {
  return `${STORAGE_KEY_PREFIX}${sessionId}`;
}

function loadEntries(sessionId: string): JournalEntry[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [];
  }

  const raw = window.localStorage.getItem(getStorageKey(sessionId));
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as JournalEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveEntries(sessionId: string, entries: JournalEntry[]): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  window.localStorage.setItem(getStorageKey(sessionId), JSON.stringify(entries));
}

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// =====================================================
// Backend-first CRUD with localStorage fallback
// =====================================================

export async function fetchJournalEntries(sessionId: string): Promise<JournalEntry[]> {
  try {
    const res = await fetch(
      `${API_BASE_URL}/api/journal/entries?sessionId=${encodeURIComponent(sessionId)}`,
      {
        method: 'GET',
        credentials: 'include'
      }
    );

    if (!res.ok) {
      throw new Error(`Backend returned ${res.status}`);
    }

    const data = (await res.json()) as any[];

    const normalized: JournalEntry[] = data.map((raw) => ({
      ...raw,
      sessionId: raw.sessionId || sessionId
    }));

    normalized.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() -
        new Date(a.timestamp).getTime()
    );

    return normalized;
  } catch (err) {
    console.error(
      'Failed to fetch journal entries from backend, falling back to localStorage:',
      err
    );
    const entries = loadEntries(sessionId);
    entries.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() -
        new Date(a.timestamp).getTime()
    );
    return entries;
  }
}

export async function createJournalEntry(
  sessionId: string,
  data: NewJournalEntryInput
): Promise<JournalEntry> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/journal/entry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ sessionId, entry: data })
    });

    if (!res.ok) {
      throw new Error(`Backend returned ${res.status}`);
    }

    const raw = await res.json();

    const entry: JournalEntry = {
      ...raw,
      sessionId: raw.sessionId || sessionId
    };

    return entry;
  } catch (err) {
    console.error(
      'Failed to create journal entry via backend, saving locally instead:',
      err
    );

    const nowIso = new Date().toISOString();
    const entries = loadEntries(sessionId);

    const entry: JournalEntry = {
      id: generateId(),
      sessionId,
      timestamp: nowIso,
      ...data,
      source: 'user'
    };

    const next = [entry, ...entries];
    saveEntries(sessionId, next);

    return entry;
  }
}

export async function updateJournalEntry(
  sessionId: string,
  entryId: string,
  patch: Partial<JournalEntry>
): Promise<JournalEntry> {
  try {
    const res = await fetch(
      `${API_BASE_URL}/api/journal/entry/${encodeURIComponent(entryId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sessionId, updates: patch })
      }
    );

    if (!res.ok) {
      throw new Error(`Backend returned ${res.status}`);
    }

    const raw = await res.json();
    const entry: JournalEntry = {
      ...raw,
      sessionId: raw.sessionId || sessionId
    };

    return entry;
  } catch (err) {
    console.error(
      'Failed to update journal entry via backend, patching local copy instead:',
      err
    );

    const entries = loadEntries(sessionId);
    const idx = entries.findIndex((e) => e.id === entryId);
    if (idx === -1) {
      throw new Error('Journal entry not found');
    }

    const current = entries[idx];
    const updated: JournalEntry = {
      ...current,
      ...patch,
      id: current.id,
      sessionId: current.sessionId
    };

    entries[idx] = updated;
    saveEntries(sessionId, entries);

    return updated;
  }
}

// =====================================================
// Tag + Symbol Query (used by /coach and analytics)
// =====================================================

export interface TagSymbolQueryResult {
  tagSummary: TagSummary | null;
  perSymbol: SymbolSummaryForTag[];
  entries: JournalEntry[];
}

/**
 * Core helper: aggregate stats for a set of entries for ONE tag.
 */
function computeTagStatsForEntries(
  tag: string,
  entries: JournalEntry[]
): { tagSummary: TagSummary | null; perSymbol: SymbolSummaryForTag[] } {
  const normalizedTag = tag.trim();
  if (!normalizedTag) {
    return {
      tagSummary: null,
      perSymbol: []
    };
  }

  const tagSummary: TagSummary = {
    tag: normalizedTag,
    total: 0,
    wins: 0,
    losses: 0,
    breakEven: 0,
    closedWithPnl: 0,
    totalPnl: 0
  };

  const bySymbol = new Map<string, SymbolSummaryForTag>();

  const closedOutcomes: TradeOutcome[] = ['Win', 'Loss', 'BreakEven'];

  entries.forEach((e) => {
    if (!e.tags || !e.tags.some((t) => t.trim() === normalizedTag)) {
      return;
    }

    tagSummary.total += 1;

    let symbolKey = e.focusSymbol || 'Unknown';
    if (!symbolKey) symbolKey = 'Unknown';

    let symbolStats = bySymbol.get(symbolKey);
    if (!symbolStats) {
      symbolStats = {
        symbol: symbolKey,
        total: 0,
        wins: 0,
        losses: 0,
        breakEven: 0,
        closedWithPnl: 0,
        totalPnl: 0
      };
      bySymbol.set(symbolKey, symbolStats);
    }

    symbolStats.total += 1;

    if (closedOutcomes.includes(e.outcome as TradeOutcome)) {
      if (e.outcome === 'Win') {
        tagSummary.wins += 1;
        symbolStats.wins += 1;
      } else if (e.outcome === 'Loss') {
        tagSummary.losses += 1;
        symbolStats.losses += 1;
      } else if (e.outcome === 'BreakEven') {
        tagSummary.breakEven += 1;
        symbolStats.breakEven += 1;
      }

      const pnl =
        typeof e.finalPnl === 'number' && !Number.isNaN(e.finalPnl)
          ? e.finalPnl
          : null;

      if (pnl !== null) {
        tagSummary.closedWithPnl += 1;
        tagSummary.totalPnl += pnl;

        symbolStats.closedWithPnl += 1;
        symbolStats.totalPnl += pnl;
      }
    }
  });

  if (tagSummary.total === 0) {
    return {
      tagSummary: null,
      perSymbol: []
    };
  }

  const perSymbol = Array.from(bySymbol.values()).sort(
    (a, b) => b.total - a.total
  );

  return {
    tagSummary,
    perSymbol
  };
}

/**
 * High-level query for AI "coach" or analytics.
 */
export async function queryJournalByTagAndSymbol(
  sessionId: string,
  tag: string,
  symbol?: string
): Promise<TagSymbolQueryResult> {
  const allEntries = await fetchJournalEntries(sessionId);
  const normalizedTag = tag.trim();
  const normalizedSymbol = symbol ? symbol.trim().toUpperCase() : null;

  let matchingEntries = allEntries.filter(
    (e) => e.tags && e.tags.some((t) => t.trim() === normalizedTag)
  );

  if (normalizedSymbol) {
    matchingEntries = matchingEntries.filter((e) => {
      const focus = (e.focusSymbol || '').toUpperCase();
      const linked = (e.linkedSymbol || '').toUpperCase();
      return focus === normalizedSymbol || linked === normalizedSymbol;
    });
  }

  const { tagSummary, perSymbol } = computeTagStatsForEntries(
    normalizedTag,
    allEntries
  );

  return {
    tagSummary,
    perSymbol,
    entries: matchingEntries
  };
}

/**
 * Optional helper: compute a full matrix of Tag × Symbol stats
 * across all entries.
 */
export async function computeTagSymbolMatrix(
  sessionId: string
): Promise<SymbolSummaryForTag[]> {
  const allEntries = await fetchJournalEntries(sessionId);

  const matrix = new Map<string, SymbolSummaryForTag>();
  const closedOutcomes: TradeOutcome[] = ['Win', 'Loss', 'BreakEven'];

  allEntries.forEach((e) => {
    if (!e.tags || !e.tags.length) return;
    if (!e.focusSymbol) return;

    const symbolKey = e.focusSymbol;
    const pnl =
      typeof e.finalPnl === 'number' && !Number.isNaN(e.finalPnl)
        ? e.finalPnl
        : null;

    e.tags.forEach((rawTag) => {
      const tag = rawTag.trim();
      if (!tag) return;

      const key = `${tag}::${symbolKey}`;
      let row = matrix.get(key);
      if (!row) {
        row = {
          symbol: symbolKey,
          total: 0,
          wins: 0,
          losses: 0,
          breakEven: 0,
          closedWithPnl: 0,
          totalPnl: 0
        };
        matrix.set(key, row);
      }

      row.total += 1;

      if (closedOutcomes.includes(e.outcome as TradeOutcome)) {
        if (e.outcome === 'Win') row.wins += 1;
        else if (e.outcome === 'Loss') row.losses += 1;
        else if (e.outcome === 'BreakEven') row.breakEven += 1;

        if (pnl !== null) {
          row.closedWithPnl += 1;
          row.totalPnl += pnl;
        }
      }
    });
  });

  return Array.from(matrix.values());
}
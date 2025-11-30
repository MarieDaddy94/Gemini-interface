import {
  JournalEntry,
  NewJournalEntryInput,
  TagSummary,
  SymbolSummaryForTag,
  TradeOutcome
} from '../types';

const STORAGE_KEY_PREFIX = 'ai-trading-analyst-journal-';

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
    // Ensure basic shape
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
  window.localStorage.setItem(
    getStorageKey(sessionId),
    JSON.stringify(entries)
  );
}

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

// ==============
// CRUD
// ==============

export async function fetchJournalEntries(
  sessionId: string
): Promise<JournalEntry[]> {
  const entries = loadEntries(sessionId);
  // Sort newest first
  entries.sort(
    (a, b) =>
      new Date(b.timestamp).getTime() -
      new Date(a.timestamp).getTime()
  );
  return entries;
}

export async function createJournalEntry(
  sessionId: string,
  data: NewJournalEntryInput
): Promise<JournalEntry> {
  const nowIso = new Date().toISOString();
  const entries = loadEntries(sessionId);

  const entry: JournalEntry = {
    id: generateId(),
    sessionId,
    timestamp: nowIso,
    ...data
  };

  const next = [entry, ...entries];
  saveEntries(sessionId, next);

  return entry;
}

export async function updateJournalEntry(
  sessionId: string,
  entryId: string,
  patch: Partial<JournalEntry>
): Promise<JournalEntry> {
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

// ==============
// Tag + Symbol Query
// ==============

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

  const closedOutcomes: TradeOutcome[] = [
    'Win',
    'Loss',
    'BreakEven'
  ];

  entries.forEach((e) => {
    if (
      !e.tags ||
      !e.tags.some((t) => t.trim() === normalizedTag)
    ) {
      return;
    }

    // Count every entry that has this tag
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

    // Only closed outcomes affect W/L/BE and PnL
    if (closedOutcomes.includes(e.outcome)) {
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
        typeof e.finalPnl === 'number' &&
        !Number.isNaN(e.finalPnl)
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

  // If nothing matched, return null summary
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
 * High-level query for AI "coach" or analytics:
 *
 * - tag (required): e.g. "LondonOpen"
 * - symbol (optional): e.g. "US30", "XAUUSD"
 *
 * Returns:
 *   - tagSummary: global stats across all symbols for that tag
 *   - perSymbol: symbol × tag stats
 *   - entries: the raw entries that match (filtered by symbol if provided)
 */
export async function queryJournalByTagAndSymbol(
  sessionId: string,
  tag: string,
  symbol?: string
): Promise<TagSymbolQueryResult> {
  const allEntries = await fetchJournalEntries(sessionId);
  const normalizedTag = tag.trim();
  const normalizedSymbol = symbol
    ? symbol.trim().toUpperCase()
    : null;

  // First, narrow to entries that have this tag
  let matchingEntries = allEntries.filter(
    (e) =>
      e.tags &&
      e.tags.some((t) => t.trim() === normalizedTag)
  );

  // Optionally filter by symbol for the entries list
  if (normalizedSymbol) {
    matchingEntries = matchingEntries.filter((e) => {
      const focus = (e.focusSymbol || '').toUpperCase();
      const linked = (e.linkedSymbol || '').toUpperCase();
      return (
        focus === normalizedSymbol || linked === normalizedSymbol
      );
    });
  }

  // Compute stats using ALL entries with that tag (across symbols),
  // so you can say things like:
  // "LondonOpen overall is 62% WR, but on US30 specifically it's 75%."
  const { tagSummary, perSymbol } =
    computeTagStatsForEntries(normalizedTag, allEntries);

  return {
    tagSummary,
    perSymbol,
    entries: matchingEntries
  };
}

/**
 * Optional helper: compute a full matrix of Tag × Symbol stats
 * across all entries. Useful if you ever want a heatmap.
 */
export async function computeTagSymbolMatrix(
  sessionId: string
): Promise<SymbolSummaryForTag[]> {
  const allEntries = await fetchJournalEntries(sessionId);

  const matrix = new Map<string, SymbolSummaryForTag>();

  const closedOutcomes: TradeOutcome[] = [
    'Win',
    'Loss',
    'BreakEven'
  ];

  allEntries.forEach((e) => {
    if (!e.tags || !e.tags.length) return;
    if (!e.focusSymbol) return;

    const symbolKey = e.focusSymbol;
    const pnl =
      typeof e.finalPnl === 'number' &&
      !Number.isNaN(e.finalPnl)
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

      if (closedOutcomes.includes(e.outcome)) {
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

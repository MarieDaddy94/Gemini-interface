
const persistence = require('../persistence');

// Default session ID for single-user mode if not specified
const DEFAULT_SESSION = 'default';

class JournalService {
  /**
   * Helper to get full journal list from DB blob
   */
  async _loadJournal(sessionId = DEFAULT_SESSION) {
    const entries = await persistence.getJournal(sessionId);
    return Array.isArray(entries) ? entries : [];
  }

  /**
   * Helper to save full journal list
   */
  async _saveJournal(sessionId, entries) {
    await persistence.setJournal(sessionId || DEFAULT_SESSION, entries);
  }

  /**
   * Log a new planned trade or generic note.
   */
  async logEntry(payload) {
    const sessionId = payload.sessionId || DEFAULT_SESSION;
    const now = new Date().toISOString();
    
    const entry = {
      id: payload.id || `entry_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: now,
      lastUpdatedAt: now,
      
      // Core fields
      source: payload.source || 'manual', // desk, autopilot, manual, voice
      environment: payload.environment || 'sim',
      symbol: payload.symbol ? payload.symbol.toUpperCase() : 'UNKNOWN',
      timeframe: payload.timeframe || null,
      direction: payload.direction || null,
      
      // Pricing & Sizing
      entryPrice: payload.entryPrice ? Number(payload.entryPrice) : null,
      stopPrice: payload.stopPrice ? Number(payload.stopPrice) : null,
      tpPrice: payload.tpPrice ? Number(payload.tpPrice) : null,
      size: payload.size ? Number(payload.size) : null,
      
      // Risk Math
      riskR: payload.riskR ? Number(payload.riskR) : 1.0, // Planned R risk
      plannedRR: payload.plannedRR ? Number(payload.plannedRR) : null,
      
      // Status
      status: payload.status || 'planned', // planned, executed, closed, cancelled
      
      // Outcomes (null until closed)
      resultR: null,
      resultPnl: null,
      
      // Context
      playbook: payload.playbook || null,
      tags: Array.isArray(payload.tags) ? payload.tags : [],
      deskGoal: payload.deskGoal || null,
      sessionPhase: payload.sessionPhase || null,
      agentAttribution: payload.agentAttribution || {},
      notes: payload.notes || '',
      
      // Raw data backups
      planJson: payload.planJson || null
    };

    const entries = await this._loadJournal(sessionId);
    entries.unshift(entry); // Newest first
    await this._saveJournal(sessionId, entries);
    
    return entry;
  }

  /**
   * Update an existing entry (e.g. when executed or closed).
   */
  async updateEntry(id, updates, sessionId = DEFAULT_SESSION) {
    const entries = await this._loadJournal(sessionId);
    const index = entries.findIndex(e => e.id === id);
    
    if (index === -1) {
      throw new Error(`Journal entry ${id} not found.`);
    }

    const current = entries[index];
    const updated = {
      ...current,
      ...updates,
      lastUpdatedAt: new Date().toISOString()
    };

    // If closing, ensure numeric values are clean
    if (updates.status === 'closed') {
      if (updates.resultR !== undefined) updated.resultR = Number(updates.resultR);
      if (updates.resultPnl !== undefined) updated.resultPnl = Number(updates.resultPnl);
    }

    entries[index] = updated;
    await this._saveJournal(sessionId, entries);
    
    return updated;
  }

  /**
   * Filter and search entries.
   */
  async listEntries(filter = {}, sessionId = DEFAULT_SESSION) {
    let entries = await this._loadJournal(sessionId);

    // Apply filters
    if (filter.symbol) {
      const s = filter.symbol.toUpperCase();
      entries = entries.filter(e => e.symbol === s);
    }
    if (filter.source) {
      entries = entries.filter(e => e.source === filter.source);
    }
    if (filter.status) {
      entries = entries.filter(e => e.status === filter.status);
    }
    if (filter.playbook) {
      entries = entries.filter(e => e.playbook && e.playbook.includes(filter.playbook));
    }
    if (filter.days) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - Number(filter.days));
      entries = entries.filter(e => new Date(e.createdAt) >= cutoff);
    }

    return entries;
  }

  /**
   * Calculate aggregated performance stats.
   */
  async getStats(filter = {}, sessionId = DEFAULT_SESSION) {
    const entries = await this.listEntries(filter, sessionId);
    
    const closed = entries.filter(e => e.status === 'closed' || e.outcome === 'Win' || e.outcome === 'Loss');
    const totalTrades = closed.length;
    
    if (totalTrades === 0) {
      return {
        totalTrades: 0,
        winRate: 0,
        avgR: 0,
        totalPnl: 0,
        bestTrade: null,
        worstTrade: null,
        playbookStats: {}
      };
    }

    let wins = 0;
    let totalR = 0;
    let totalPnl = 0;
    let maxDrawdownR = 0;
    let currentDrawdownR = 0;

    // Sorting for equity curve sim
    const sorted = [...closed].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    const playbookStats = {};

    sorted.forEach(t => {
      // Normalize outcome check
      const isWin = (t.resultR && t.resultR > 0) || t.outcome === 'Win';
      const r = t.resultR || (t.outcome === 'Win' ? 1 : t.outcome === 'Loss' ? -1 : 0);
      const pnl = t.resultPnl || t.pnl || 0;

      if (isWin) wins++;
      totalR += r;
      totalPnl += pnl;

      // Drawdown calc (R-based)
      if (r < 0) {
        currentDrawdownR += r;
        if (currentDrawdownR < maxDrawdownR) maxDrawdownR = currentDrawdownR;
      } else {
        currentDrawdownR = 0;
      }

      // Playbook breakdown
      const pb = t.playbook || 'Uncategorized';
      if (!playbookStats[pb]) playbookStats[pb] = { count: 0, wins: 0, totalR: 0 };
      playbookStats[pb].count++;
      playbookStats[pb].totalR += r;
      if (isWin) playbookStats[pb].wins++;
    });

    return {
      totalTrades,
      winRate: Number((wins / totalTrades).toFixed(2)),
      avgR: Number((totalR / totalTrades).toFixed(2)),
      totalR: Number(totalR.toFixed(2)),
      totalPnl: Number(totalPnl.toFixed(2)),
      maxDrawdownR: Number(maxDrawdownR.toFixed(2)),
      playbookStats
    };
  }
}

module.exports = new JournalService();

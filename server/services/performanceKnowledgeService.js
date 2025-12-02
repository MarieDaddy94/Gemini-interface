
const journalService = require('./journalService');

/**
 * Performance Knowledge Service
 * 
 * Aggregates journal data to answer: "What works best for this trader?"
 * Used by DeskPolicyEngine to set adaptive rules.
 */
class PerformanceKnowledgeService {
  
  /**
   * Get performance metrics grouped by playbook.
   * Useful for whitelist/blocklist logic.
   */
  async getPlaybookStats(sessionId = 'default', lookbackDays = 60) {
    const stats = await journalService.getStats({ days: lookbackDays }, sessionId);
    const pbStats = stats.playbookStats || {};
    
    // Transform into array for easier sorting
    return Object.entries(pbStats).map(([name, data]) => ({
      name,
      count: data.count,
      wins: data.wins,
      totalR: data.totalR,
      winRate: data.count > 0 ? data.wins / data.count : 0,
      avgR: data.count > 0 ? data.totalR / data.count : 0
    }));
  }

  /**
   * Get symbol specific stats.
   * Useful for determining if we should block specific pairs.
   */
  async getSymbolStats(sessionId = 'default', lookbackDays = 60) {
    const entries = await journalService.listEntries({ days: lookbackDays, status: 'closed' }, sessionId);
    
    const groups = {};
    entries.forEach(e => {
        const sym = e.symbol || 'UNKNOWN';
        if (!groups[sym]) groups[sym] = { count: 0, wins: 0, totalR: 0 };
        
        groups[sym].count++;
        // Infer R outcome
        let r = e.resultR;
        if (r === undefined || r === null) {
            if (e.outcome === 'Win') r = 1;
            else if (e.outcome === 'Loss') r = -1;
            else r = 0;
        }
        groups[sym].totalR += r;
        if (r > 0) groups[sym].wins++;
    });

    return Object.entries(groups).map(([symbol, data]) => ({
        symbol,
        count: data.count,
        winRate: data.count > 0 ? data.wins / data.count : 0,
        avgR: data.count > 0 ? data.totalR / data.count : 0,
        totalR: data.totalR
    }));
  }

  /**
   * Get recent streak info (last N trades).
   * Useful for "Cold Streak" logic -> reduce risk.
   */
  async getRecentStreak(sessionId = 'default', lastN = 5) {
    const entries = await journalService.listEntries({ status: 'closed' }, sessionId);
    // Entries come sorted new->old usually, but ensuring sort
    entries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    const recent = entries.slice(0, lastN);
    let consecutiveLosses = 0;
    
    for (const t of recent) {
        const r = t.resultR !== undefined ? t.resultR : (t.outcome === 'Loss' ? -1 : 1);
        if (r < 0) consecutiveLosses++;
        else break;
    }

    return {
        consecutiveLosses,
        lastN_R: recent.reduce((sum, t) => sum + (t.resultR || 0), 0)
    };
  }
}

module.exports = new PerformanceKnowledgeService();

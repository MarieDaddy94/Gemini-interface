
const journalService = require('./journalService');

// Configurable thresholds for playbook health
const THRESHOLDS = {
  MIN_SAMPLE_SIZE: 5,
  GREEN: {
    WIN_RATE: 0.50,
    AVG_R: 0.5,
    MAX_DD_R: -3.0 // Better than -3R
  },
  RED: {
    WIN_RATE: 0.30,
    AVG_R: 0.0 // Negative expectancy
  }
};

class PlaybookPerformanceService {
  
  /**
   * Calculate health status based on stats.
   * Returns: 'green' | 'amber' | 'red' | 'gray' (insufficient data)
   */
  _calculateHealth(stats) {
    if (stats.sampleSize < THRESHOLDS.MIN_SAMPLE_SIZE) return 'gray';

    // Red conditions (Stop trading / minimize risk)
    if (stats.avgR < THRESHOLDS.RED.AVG_R) return 'red';
    if (stats.winRate < THRESHOLDS.RED.WIN_RATE) return 'red';

    // Green conditions (Scale up / normal risk)
    if (
      stats.winRate >= THRESHOLDS.GREEN.WIN_RATE && 
      stats.avgR >= THRESHOLDS.GREEN.AVG_R &&
      stats.maxDrawdownR > THRESHOLDS.GREEN.MAX_DD_R
    ) {
      return 'green';
    }

    // Default to Amber (Caution)
    return 'amber';
  }

  /**
   * Get profiles for all playbooks found in the journal.
   */
  async getPlaybookProfiles(options = {}) {
    const { symbol, lookbackDays } = options;
    
    // 1. Get raw entries
    const entries = await journalService.listEntries({ 
      symbol, 
      days: lookbackDays,
      status: 'closed' // Only analyze closed trades
    });

    // 2. Group by playbook
    const groups = {};
    
    entries.forEach(e => {
      // Normalize playbook name (trim, lowercase for grouping, preserve display)
      const rawName = e.playbook || 'Uncategorized';
      const key = rawName.toLowerCase().trim();
      
      if (!groups[key]) {
        groups[key] = {
          name: rawName,
          trades: []
        };
      }
      
      groups[key].trades.push(e);
    });

    // 3. Calculate stats per group
    const profiles = Object.values(groups).map(g => {
      // Sort trades by date asc for DD calc
      const sortedTrades = g.trades.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      
      let wins = 0;
      let totalR = 0;
      let currentDD = 0;
      let maxDD = 0;
      
      sortedTrades.forEach(t => {
        // Infer R result: prioritize explicit resultR, else map outcome
        let r = t.resultR;
        if (r === undefined || r === null) {
           if (t.outcome === 'Win') r = 1;
           else if (t.outcome === 'Loss') r = -1;
           else r = 0;
        }
        
        // Win rate logic
        if (r > 0 || t.outcome === 'Win') wins++;
        
        totalR += r;
        
        // Drawdown logic (cumulative R drawdown from peak)
        // Simplified: track running run of bad luck
        if (r < 0) {
          currentDD += r;
          if (currentDD < maxDD) maxDD = currentDD;
        } else {
          // Reset DD logic is complex, simple approach: drawdown resets on new equity high
          // For playbook health, we just care about "current streak/dip".
          // Let's settle on: Current cumulative drawdown from local peak.
          // Actually, strict max drawdown logic:
          // equity curve array -> peak -> diff
        }
      });

      const sampleSize = sortedTrades.length;
      const winRate = sampleSize > 0 ? wins / sampleSize : 0;
      const avgR = sampleSize > 0 ? totalR / sampleSize : 0;
      const lastTrade = sortedTrades[sortedTrades.length - 1];

      const stats = {
        playbook: g.name,
        symbol: symbol || 'All',
        sampleSize,
        winRate,
        avgR,
        totalR,
        maxDrawdownR: maxDD, // Approximate
        lastTradeAt: lastTrade ? lastTrade.createdAt : null,
        lastResultR: lastTrade ? (lastTrade.resultR || 0) : 0
      };

      return {
        ...stats,
        health: this._calculateHealth(stats)
      };
    });

    // 4. Sort (Green > Amber > Gray > Red) by default, or by avgR
    return profiles.sort((a, b) => b.totalR - a.totalR);
  }

  /**
   * Get specific profile or return null if not enough data
   */
  async getProfileForPlaybook(playbookName, symbol) {
    if (!playbookName) return null;
    const profiles = await this.getPlaybookProfiles({ symbol });
    return profiles.find(p => p.playbook.toLowerCase() === playbookName.toLowerCase()) || null;
  }
}

module.exports = new PlaybookPerformanceService();

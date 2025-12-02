
const journalService = require('./journalService');

/**
 * Calculates performance stats per Agent Role.
 * This helps the ModelPolicyEngine decide if a role needs a model swap.
 */
class ModelPerformanceService {
  
  async getRolePerformance(sessionId = 'default', lookbackTrades = 50) {
    const entries = await journalService.listEntries({ status: 'closed' }, sessionId);
    
    // Sort recent first
    entries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const recent = entries.slice(0, lookbackTrades);

    const roleStats = {};

    recent.forEach(e => {
        // Fallback: if no agentId, try to infer or skip
        const role = this._normalizeRole(e.agentId);
        if (!role) return;

        if (!roleStats[role]) {
            roleStats[role] = { role, tradeCount: 0, wins: 0, totalR: 0, maxDrawdownR: 0, currentRunR: 0 };
        }

        const stat = roleStats[role];
        stat.tradeCount++;
        
        let r = e.resultR;
        if (r === undefined || r === null) {
            r = e.outcome === 'Win' ? 1 : e.outcome === 'Loss' ? -1 : 0;
        }

        stat.totalR += r;
        if (r > 0) stat.wins++;

        // Drawdown logic
        if (r < 0) {
            stat.currentRunR += r;
            if (stat.currentRunR < stat.maxDrawdownR) stat.maxDrawdownR = stat.currentRunR;
        } else {
            stat.currentRunR = 0;
        }
    });

    // Format output
    return Object.values(roleStats).map(s => ({
        role: s.role,
        tradeCount: s.tradeCount,
        winRate: s.tradeCount > 0 ? s.wins / s.tradeCount : 0,
        avgR: s.tradeCount > 0 ? s.totalR / s.tradeCount : 0,
        totalR: s.totalR,
        maxDrawdownR: s.maxDrawdownR
    }));
  }

  _normalizeRole(agentId) {
      if (!agentId) return null;
      const lower = agentId.toLowerCase();
      if (lower.includes('strat')) return 'strategist';
      if (lower.includes('risk')) return 'risk';
      if (lower.includes('quant')) return 'quant';
      if (lower.includes('exec')) return 'execution';
      if (lower.includes('patt')) return 'pattern';
      if (lower.includes('journal')) return 'journal';
      return 'other';
  }
}

module.exports = new ModelPerformanceService();

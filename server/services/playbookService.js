
const persistence = require('../persistence');
const journalService = require('./journalService');

class PlaybookService {
  
  async listPlaybooks(filter = {}) {
    return await persistence.getPlaybooks(filter);
  }

  async getPlaybook(id) {
    return await persistence.getPlaybook(id);
  }

  async createPlaybook(data) {
    const id = `pb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();
    
    const playbook = {
      id,
      name: data.name || "Untitled Playbook",
      symbol: data.symbol || "US30",
      timeframe: data.timeframe || "15m",
      kind: data.kind || "intraday",
      tier: data.tier || "experimental",
      trigger: data.trigger || "custom",
      riskTemplate: data.riskTemplate || { baseRiskR: 0.5 },
      rulesText: data.rulesText || "",
      llmPrompt: data.llmPrompt || "",
      tags: data.tags || [],
      exampleSnapshotIds: data.exampleSnapshotIds || [],
      performance: {
        trades: 0,
        wins: 0,
        losses: 0,
        avgR: 0,
        maxDrawdownR: 0,
        lastUsedAt: null
      },
      createdAt: now,
      updatedAt: now,
      archived: false
    };

    await persistence.savePlaybook(playbook);
    return playbook;
  }

  async updatePlaybook(id, patch) {
    const existing = await this.getPlaybook(id);
    if (!existing) throw new Error(`Playbook ${id} not found`);

    const updated = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString()
    };

    await persistence.savePlaybook(updated);
    return updated;
  }

  async archivePlaybook(id) {
    return this.updatePlaybook(id, { archived: true });
  }

  /**
   * Recompute stats by scanning journal entries tagged with this playbookId (or matching name).
   */
  async recomputePlaybookStats(id) {
    const playbook = await this.getPlaybook(id);
    if (!playbook) return null;

    // Get all journal entries
    const entries = await journalService.listEntries(); // In a real DB we'd query by playbookId
    
    // Filter relevant entries
    // 1. Match by ID if present
    // 2. Fallback to name match (case insensitive)
    const matches = entries.filter(e => {
        if (e.playbookId === id) return true;
        if (!e.playbookId && e.playbook && e.playbook.toLowerCase().trim() === playbook.name.toLowerCase().trim()) return true;
        return false;
    });

    if (matches.length === 0) {
        // No stats reset
        return this.updatePlaybook(id, {
            performance: {
                trades: 0,
                wins: 0,
                losses: 0,
                avgR: 0,
                maxDrawdownR: 0,
                lastUsedAt: null
            }
        });
    }

    // Sort by time
    matches.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    let wins = 0;
    let losses = 0;
    let totalR = 0;
    let currentDD = 0;
    let maxDD = 0;

    matches.forEach(t => {
        // Infer R
        let r = t.resultR;
        if (r === undefined || r === null) {
            if (t.outcome === 'Win') r = 1;
            else if (t.outcome === 'Loss') r = -1;
            else r = 0;
        }

        totalR += r;
        if (r > 0) wins++;
        else if (r < 0) losses++;

        // DD Logic
        if (r < 0) {
            currentDD += r;
            if (currentDD < maxDD) maxDD = currentDD;
        } else {
            if (currentDD < 0) currentDD += r;
            if (currentDD > 0) currentDD = 0; 
        }
    });

    const trades = matches.length;
    const avgR = totalR / trades;
    const lastUsedAt = matches[matches.length - 1].createdAt;

    const newStats = {
        trades,
        wins,
        losses,
        avgR: Number(avgR.toFixed(2)),
        maxDrawdownR: Number(maxDD.toFixed(2)),
        lastUsedAt
    };

    return this.updatePlaybook(id, { performance: newStats });
  }

  /**
   * Recommend specific playbooks based on tier and stats.
   * Phase N helper for Desk Coordinator.
   */
  async getRecommendedLineup() {
    const playbooks = await this.listPlaybooks();
    
    // Sort logic: Tier A first, then by AvgR
    playbooks.sort((a, b) => {
        if (a.tier === 'A' && b.tier !== 'A') return -1;
        if (b.tier === 'A' && a.tier !== 'A') return 1;
        return b.performance.avgR - a.performance.avgR;
    });

    // Top 2 Primary
    const primary = playbooks.filter(p => p.tier === 'A' || p.tier === 'B').slice(0, 2);
    
    // 1 Experimental
    const experimental = playbooks.find(p => p.tier === 'experimental' || p.tier === 'C');

    return {
        primary,
        experimental: experimental ? [experimental] : []
    };
  }
}

module.exports = new PlaybookService();

const performanceService = require('./performanceKnowledgeService');
const persistence = require('../persistence');

const POLICY_KEY = 'current_desk_policy';

class DeskPolicyEngine {

  /**
   * Generate a fresh policy based on user stats and global risk defaults.
   */
  async generateDailyPolicy(sessionId = 'default') {
    const playbookStats = await performanceService.getPlaybookStats(sessionId, 60);
    const streak = await performanceService.getRecentStreak(sessionId, 5);
    
    // 1. Identify Green Playbooks (> 40% WR and > 0.2 AvgR, min 3 samples)
    const greenPlaybooks = playbookStats
        .filter(p => p.count >= 3 && p.winRate >= 0.4 && p.avgR > 0.2)
        .map(p => p.name);

    // 2. Base Risk
    let maxRiskPerTrade = 0.5; // Default 0.5%
    let notes = [];

    // 3. Adaptive Logic
    if (streak.consecutiveLosses >= 2) {
        maxRiskPerTrade = 0.25;
        notes.push(`⚠️ Cold Streak Detected (${streak.consecutiveLosses} losses). Risk halved to 0.25%.`);
    } else if (streak.consecutiveLosses >= 4) {
        maxRiskPerTrade = 0.0;
        notes.push(`⛔ Stop Trading Recommended. 4+ consecutive losses.`);
    } else {
        notes.push("✅ Standard risk allowed.");
    }

    if (greenPlaybooks.length > 0) {
        notes.push(`🎯 Focus Playbooks: ${greenPlaybooks.join(', ')}`);
    } else {
        notes.push("⚠️ No high-performing playbooks found in last 60 days. Trade with caution.");
    }

    // Create Policy Object
    const policy = {
        id: `pol_${Date.now()}`,
        createdAt: new Date().toISOString(),
        date: new Date().toISOString().split('T')[0],
        mode: 'advisory', // Default to advisory
        maxRiskPerTrade,
        maxDailyLossR: -3.0,
        maxTradesPerDay: 5,
        allowedPlaybooks: greenPlaybooks.length > 0 ? greenPlaybooks : ["*"], // * means all if none found
        notes: notes.join('\n'),
        contextStats: {
            winRate: playbookStats.length > 0 ? playbookStats[0].winRate : 0,
            avgR: playbookStats.length > 0 ? playbookStats[0].avgR : 0,
            bestPlaybook: playbookStats.length > 0 ? playbookStats[0].name : "None"
        }
    };

    // Save as current
    await this.savePolicy(policy);
    return policy;
  }

  /**
   * Get the currently active policy (or generate a default if missing).
   */
  async getCurrentPolicy() {
    // In a real DB, we'd query by date. For simple persistence, we just get the blob.
    // If we want session-specific, we'd need to augment persistence. 
    // Using a singleton key for the "desk" concept for now.
    
    // We'll use the session table to store this under a special ID or just use a file.
    // Let's reuse persistence session storage but with a special ID "desk_policy_global".
    const data = await persistence.getSession(POLICY_KEY);
    
    if (!data) {
        // Generate a fresh one if missing
        return await this.generateDailyPolicy();
    }
    
    return data;
  }

  /**
   * Save a policy (update mode, manual overrides, etc.)
   */
  async savePolicy(policy) {
    await persistence.setSession(POLICY_KEY, policy);
    return policy;
  }
}

module.exports = new DeskPolicyEngine();

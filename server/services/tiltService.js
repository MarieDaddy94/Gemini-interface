
const persistence = require('../persistence');
const journalService = require('./journalService');
const { getBrokerSnapshot } = require('../broker/brokerStateStore');

const TILT_KEY = 'current_tilt_state';

// Thresholds
const RULES = {
  RAPID_LOSSES_COUNT: 2, // e.g. 2 consecutive losses
  WARMING_STREAK: 3,     // 3 losses => warming
  HOT_STREAK: 4,         // 4 losses => hot
  TILT_STREAK: 5,        // 5+ losses => tilt
  OVERTRADING_LIMIT: 5   // trades per day
};

class TiltService {

  async getTiltState(sessionId = 'default') {
    // 1. Try to load from persistence (overrides, state carryover)
    // For now, we recalculate mostly fresh but respect manual override if we stored it.
    // Ideally we persist state daily. Let's just calc fresh for V1 simplicity.
    
    // 2. Fetch Context
    const entries = await journalService.listEntries({ days: 1 }, sessionId);
    const snapshot = getBrokerSnapshot(sessionId);
    
    // 3. Analyze
    return this._analyzeState(entries, snapshot);
  }

  async _analyzeState(entries, snapshot) {
    const signals = [];
    const todayEntries = entries.filter(e => {
        const d = new Date(e.createdAt);
        const today = new Date();
        return d.getDate() === today.getDate() && d.getMonth() === today.getMonth();
    });

    // Sort oldest to newest for streak calc
    todayEntries.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    // A. Consecutive Losses
    let consecutiveLosses = 0;
    for (let i = todayEntries.length - 1; i >= 0; i--) {
        const e = todayEntries[i];
        // outcome might be Open, Win, Loss, BE.
        // infer R if present, else outcome
        let r = e.resultR;
        if (r === undefined || r === null) {
            if (e.outcome === 'Loss') r = -1;
            else if (e.outcome === 'Win') r = 1;
            else r = 0; // open or be
        }
        
        if (r < 0) consecutiveLosses++;
        else if (r > 0) break; // streak broken
    }

    if (consecutiveLosses >= RULES.RAPID_LOSSES_COUNT) {
        signals.push({
            timestamp: new Date().toISOString(),
            reason: 'rapid_losses',
            details: `${consecutiveLosses} consecutive losses`
        });
    }

    // B. Daily Drawdown (Approximate from snapshot if available, else sum journal R)
    let dailyR = 0;
    todayEntries.forEach(e => dailyR += (e.resultR || 0));
    
    // Hardcoded daily stop for now, or from policy.
    // We'll assume a standard -3R stop.
    if (dailyR <= -3) {
        signals.push({
            timestamp: new Date().toISOString(),
            reason: 'session_dd_hit',
            details: `Daily R is ${dailyR.toFixed(2)}R`
        });
    }

    // C. Overtrading
    if (todayEntries.length > RULES.OVERTRADING_LIMIT) {
        signals.push({
            timestamp: new Date().toISOString(),
            reason: 'overtrading',
            details: `${todayEntries.length} trades today`
        });
    }

    // Determine State & Mode
    let riskState = 'normal';
    let defenseMode = 'normal';

    // Lockdown Trigger
    if (dailyR <= -3 || consecutiveLosses >= 5) {
        riskState = 'lockdown';
        defenseMode = 'lockdown';
    } 
    // Tilt Risk / Defense Trigger
    else if (consecutiveLosses >= 4) {
        riskState = 'tilt_risk';
        defenseMode = 'defense'; // No new risk
    }
    // Hot / Caution Trigger
    else if (consecutiveLosses >= 2) {
        riskState = 'hot';
        defenseMode = 'caution';
    }
    // Warming
    else if (consecutiveLosses >= 1) {
        riskState = 'warming';
        defenseMode = 'normal';
    }

    return {
        riskState,
        defenseMode,
        tiltSignals: signals,
        lastUpdate: new Date().toISOString()
    };
  }

  /**
   * Adapts a DeskPolicy based on the current defense mode.
   */
  applyDefenseMode(policy, defenseMode) {
    const adapted = { ...policy };

    if (defenseMode === 'caution') {
        adapted.maxRiskPerTrade = Math.min(policy.maxRiskPerTrade, 0.25);
        adapted.notes += "\n[DEFENSE] Mode: CAUTION. Risk capped at 0.25%.";
    } 
    else if (defenseMode === 'defense') {
        adapted.maxRiskPerTrade = 0.0; // Effectively no new risk allowed
        adapted.notes += "\n[DEFENSE] Mode: DEFENSE. New risk blocked. Manage existing only.";
        adapted.mode = 'enforced';
    }
    else if (defenseMode === 'lockdown') {
        adapted.maxRiskPerTrade = 0.0;
        adapted.notes += "\n[DEFENSE] Mode: LOCKDOWN. Trading suspended.";
        adapted.mode = 'enforced';
    }

    return adapted;
  }
}

module.exports = new TiltService();

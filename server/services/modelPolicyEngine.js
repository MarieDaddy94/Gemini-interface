
const persistence = require('../persistence');
const performanceService = require('./modelPerformanceService');

// Default Models
const DEFAULT_GEMINI = { provider: 'gemini', model: 'gemini-2.5-flash' };
const DEFAULT_GEMINI_THINKING = { provider: 'gemini', model: 'gemini-2.5-flash-thinking' }; // Smart
const DEFAULT_OPENAI = { provider: 'openai', model: 'gpt-4o' };
const DEFAULT_OPENAI_MINI = { provider: 'openai', model: 'gpt-4o-mini' };

const BASE_LINEUP = {
    strategist: DEFAULT_GEMINI_THINKING,
    risk: DEFAULT_OPENAI, // OpenAI is good at strict rules
    quant: DEFAULT_GEMINI,
    execution: DEFAULT_GEMINI,
    pattern: DEFAULT_OPENAI, // GPT-4o vision is sharp
    journal: DEFAULT_GEMINI
};

class ModelPolicyEngine {

    async getActiveLineup() {
        const policy = await persistence.getActiveModelPolicy();
        if (policy) return policy;

        // Create default if none exists
        const defaultPolicy = {
            id: `mp_${Date.now()}`,
            createdAt: new Date().toISOString(),
            lineup: BASE_LINEUP,
            recommendations: []
        };
        await persistence.saveModelPolicy(defaultPolicy);
        return defaultPolicy;
    }

    async generateRecommendations() {
        const currentPolicy = await this.getActiveLineup();
        const currentLineup = currentPolicy.lineup;
        const stats = await performanceService.getRolePerformance();
        
        const recommendations = [];

        // Logic: Promote underdogs if current model is failing
        stats.forEach(stat => {
            const role = stat.role;
            const currentModel = currentLineup[role];
            if (!currentModel) return;

            // Rule 1: If Avg R < -0.2 after 5 trades, suggest swap
            if (stat.tradeCount >= 5 && stat.avgR < -0.2) {
                const alt = currentModel.provider === 'gemini' ? DEFAULT_OPENAI : DEFAULT_GEMINI;
                recommendations.push({
                    role,
                    action: 'SWAP',
                    from: currentModel,
                    to: alt,
                    reason: `Current model Avg R is ${stat.avgR.toFixed(2)} after ${stat.tradeCount} trades. Try ${alt.provider}.`
                });
            }

            // Rule 2: If WinRate > 60% and >10 trades, pin/promote to "Pro" model
            if (stat.tradeCount >= 10 && stat.winRate > 0.6) {
                // If using mini/flash, suggest pro/thinking
                if (currentModel.model.includes('mini') || currentModel.model.includes('flash')) {
                     const upgrade = currentModel.provider === 'gemini' ? 'gemini-2.5-pro' : 'gpt-4o';
                     if (currentModel.model !== upgrade) {
                        recommendations.push({
                            role,
                            action: 'UPGRADE',
                            from: currentModel,
                            to: { provider: currentModel.provider, model: upgrade },
                            reason: `High performance (${(stat.winRate*100).toFixed(0)}% WR). Promote to ${upgrade} for max edge.`
                        });
                     }
                }
            }
        });

        return recommendations;
    }

    async applyRecommendation(rec) {
        const current = await this.getActiveLineup();
        const newLineup = { ...current.lineup };
        
        newLineup[rec.role] = rec.to;

        const newPolicy = {
            id: `mp_${Date.now()}`,
            createdAt: new Date().toISOString(),
            lineup: newLineup,
            recommendations: [] // Clear recs after apply
        };

        await persistence.saveModelPolicy(newPolicy);
        return newPolicy;
    }
}

module.exports = new ModelPolicyEngine();

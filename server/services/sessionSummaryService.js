
const persistence = require('../persistence');
const journalService = require('./journalService');
const tiltService = require('./tiltService');
const playbookService = require('./playbookService');
const deskPolicyEngine = require('./deskPolicyEngine');
const { callLLM } = require('../llmRouter');

class SessionSummaryService {

    async getSessions() {
        return await persistence.getDeskSessions(10);
    }

    // PHASE O: Start of Day Gameplan
    async createGameplan(marketSession) {
        const today = new Date().toISOString().split('T')[0];
        const sessionId = `sess_${today}_${marketSession}`;

        // 1. Fetch Context
        const policy = await deskPolicyEngine.getCurrentPolicy();
        const tiltState = await tiltService.getTiltState();
        const lineup = await playbookService.getRecommendedLineup(); // Primary & Exp playbooks

        // 2. Build Prompt for Strategist
        const prompt = `
        You are the Head Strategist. Create a trading gameplan for the ${marketSession} session.
        
        Context:
        - Desk Policy Mode: ${policy.mode} (Max Risk: ${policy.maxRiskPerTrade}%)
        - Tilt State: ${tiltState.defenseMode} (${tiltState.riskState})
        - Recommended Playbooks: ${lineup.primary.map(p => p.name).join(', ')}
        
        Task:
        1. Set a concrete "Session Goal" (e.g. "Secure +2R using NY Reversal playbook, maintain calm").
        2. Define a "Lockdown Trigger" (e.g. if we hit -2R, stop).
        3. Confirm the active playbook list.
        
        Respond in JSON:
        {
            "highLevelGoal": string,
            "lockdownTriggerR": number,
            "activePlaybooks": [{ "playbookId": string, "name": string, "role": "primary"|"experimental" }],
            "focusNotes": string
        }
        `;

        const llmOutput = await callLLM({
            provider: 'openai',
            model: 'gpt-4o',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.4
        });

        let parsed = null;
        try {
            parsed = JSON.parse(llmOutput.replace(/```json/g, "").replace(/```/g, "").trim());
        } catch(e) {
            console.error("Gameplan JSON parse failed", e);
            // Fallback
            parsed = {
                highLevelGoal: "Execute standard playbooks with discipline.",
                lockdownTriggerR: -3,
                activePlaybooks: [],
                focusNotes: "System failed to generate detailed plan."
            };
        }

        // 3. Construct Gameplan Object
        const gameplan = {
            sessionId,
            date: today,
            marketSession,
            ...parsed,
            riskPolicySnapshot: policy,
            createdAt: new Date().toISOString()
        };

        // 4. Create/Update Session Record
        const sessionRec = {
            id: sessionId,
            date: today,
            startTime: new Date().toISOString(),
            endTime: null,
            summary: `Session Started: ${gameplan.highLevelGoal}`,
            tags: "Active",
            stats: { totalR: 0, totalPnl: 0, tradeCount: 0 },
            rawEvents: [{ type: 'plan_created', ts: Date.now(), gameplan }],
            gameplan: gameplan,
            debrief: null
        };

        await persistence.saveDeskSession(sessionRec);
        return sessionRec;
    }

    // PHASE O: End of Day Debrief
    async generateDebrief(sessionId) {
        const sessionRec = await persistence.getDeskSessionById(sessionId);
        if (!sessionRec) throw new Error("Session not found");

        const entries = await journalService.listEntries();
        // Filter entries created today/during session
        // Simple date match for now
        const sessionEntries = entries.filter(e => e.createdAt.startsWith(sessionRec.date));

        // Stats
        let totalR = 0, totalPnl = 0, wins = 0;
        sessionEntries.forEach(e => {
            if (e.resultR) totalR += e.resultR;
            if (e.resultPnl) totalPnl += e.resultPnl;
            if (e.outcome === 'Win') wins++;
        });

        // AI Narrative
        const prompt = `
        You are the Desk Coach. Review this session (${sessionId}).
        
        Gameplan Goal: "${sessionRec.gameplan?.highLevelGoal || 'None'}"
        Actual Results: ${totalR.toFixed(2)}R, $${totalPnl.toFixed(2)}, ${wins}/${sessionEntries.length} wins.
        
        Trades:
        ${sessionEntries.map(e => `- ${e.symbol} ${e.direction}: ${e.resultR}R (${e.playbook})`).join('\n')}
        
        Task:
        1. Did we hit the goal?
        2. What was the best execution?
        3. Suggest 1 actionable improvement for tomorrow.
        
        Respond in JSON:
        {
            "goalMet": boolean,
            "narrative": string,
            "bestTradeId": string | null,
            "improvements": string[]
        }
        `;

        const llmOutput = await callLLM({
            provider: 'openai',
            model: 'gpt-4o',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.4
        });

        let parsed = {};
        try {
            parsed = JSON.parse(llmOutput.replace(/```json/g, "").replace(/```/g, "").trim());
        } catch(e) { parsed = { narrative: llmOutput }; }

        const debrief = {
            ...parsed,
            scorecard: {
                totalR,
                totalPnl,
                winRate: sessionEntries.length > 0 ? wins / sessionEntries.length : 0,
                tradeCount: sessionEntries.length
            },
            generatedAt: new Date().toISOString()
        };

        // Update Session
        const updatedSession = {
            ...sessionRec,
            endTime: new Date().toISOString(),
            summary: debrief.narrative,
            tags: totalR > 0 ? "Green" : "Red",
            stats: { totalR, totalPnl, tradeCount: sessionEntries.length },
            debrief: debrief
        };

        await persistence.saveDeskSession(updatedSession);
        return updatedSession;
    }

    // Original Daily Summary (Legacy Compat)
    async generateDailySummary(dateStr) {
        // ... kept for compatibility if needed, but generateDebrief replaces it logic-wise
        return this.generateDebrief(`sess_${dateStr}_NY`); // Defaulting to generic ID if called
    }
}

module.exports = new SessionSummaryService();

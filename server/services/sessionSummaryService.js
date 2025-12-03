
const persistence = require('../persistence');
const journalService = require('./journalService');
const tiltService = require('./tiltService');
const playbookService = require('./playbookService');
const deskPolicyEngine = require('./deskPolicyEngine');
const { callLLM } = require('../llmRouter');
const { getBrokerSnapshot } = require('../broker/brokerStateStore');

class SessionSummaryService {

    async getSessions() {
        return await persistence.getDeskSessions(10);
    }

    // --- Unified Session Accessor ---
    async getCurrentSessionState() {
        // 1. Get active desk session record
        const sessions = await persistence.getDeskSessions(1);
        const currentSession = sessions.length > 0 && !sessions[0].endTime ? sessions[0] : null;
        
        // 2. Get volatile desk state (halted?)
        const deskState = await persistence.getDeskState() || { tradingHalted: false };
        
        // 3. Get Tilt/Policy
        const tilt = await tiltService.getTiltState();
        const policy = await deskPolicyEngine.getCurrentPolicy();
        
        // 4. Calculate Live PnL for session
        let livePnl = 0;
        let totalR = 0;
        
        if (currentSession) {
            // Recalculate stats from journal for today
            const entries = await journalService.listEntries();
            const sessionEntries = entries.filter(e => e.createdAt >= currentSession.startTime);
            sessionEntries.forEach(e => {
                if (e.resultPnl) livePnl += e.resultPnl;
                if (e.resultR) totalR += e.resultR;
            });
        }

        return {
            sessionId: currentSession ? currentSession.id : null,
            isActive: !!currentSession,
            gameplan: currentSession ? currentSession.gameplan : null,
            executionMode: currentSession?.gameplan?.executionMode || 'sim',
            tradingHalted: deskState.tradingHalted,
            stats: {
                totalR,
                totalPnl: livePnl,
            },
            risk: {
                tiltMode: tilt.defenseMode,
                policyMode: policy.mode,
                maxSessionRiskR: currentSession?.gameplan?.lockdownTriggerR || -3
            }
        };
    }

    async toggleTradingHalt(halted) {
        const current = await persistence.getDeskState() || {};
        current.tradingHalted = halted;
        await persistence.saveDeskState('current', current);
        return current;
    }

    // PHASE O: Start of Day Gameplan (Updated for Phase P)
    async createGameplan({ marketSession, executionMode, riskCapR }) {
        const today = new Date().toISOString().split('T')[0];
        const sessionId = `sess_${today}_${marketSession}`;

        // 1. Fetch Context
        const policy = await deskPolicyEngine.getCurrentPolicy();
        const tiltState = await tiltService.getTiltState();
        const lineup = await playbookService.getRecommendedLineup(); // Primary & Exp playbooks

        // 2. Build Prompt for Strategist
        const prompt = `
        You are the Head Strategist. Create a trading gameplan for the ${marketSession} session.
        Mode: ${executionMode || 'SIM'}
        
        Context:
        - Desk Policy Mode: ${policy.mode} (Max Risk: ${policy.maxRiskPerTrade}%)
        - Tilt State: ${tiltState.defenseMode} (${tiltState.riskState})
        - Recommended Playbooks: ${lineup.primary.map(p => p.name).join(', ')}
        
        Task:
        1. Set a concrete "Session Goal" (e.g. "Secure +2R using NY Reversal playbook, maintain calm").
        2. Define a "Lockdown Trigger" (Recommend: ${riskCapR || -3}R).
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
                lockdownTriggerR: riskCapR || -3,
                activePlaybooks: [],
                focusNotes: "System failed to generate detailed plan."
            };
        }

        // 3. Construct Gameplan Object
        const gameplan = {
            sessionId,
            date: today,
            marketSession,
            executionMode: executionMode || 'sim',
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
        
        // Reset Halt state on new session
        await this.toggleTradingHalt(false);
        
        return sessionRec;
    }

    // PHASE O: End of Day Debrief
    async generateDebrief(sessionId) {
        const sessionRec = await persistence.getDeskSessionById(sessionId);
        if (!sessionRec) throw new Error("Session not found");

        const entries = await journalService.listEntries();
        // Filter entries created today/during session
        // Simple date match for now
        const sessionEntries = entries.filter(e => e.createdAt >= sessionRec.startTime);

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
        return this.generateDebrief(`sess_${dateStr}_NY`); 
    }
}

module.exports = new SessionSummaryService();

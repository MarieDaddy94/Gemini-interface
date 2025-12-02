
const persistence = require('../persistence');
const journalService = require('./journalService');
const { callLLM } = require('../llmRouter');

class SessionSummaryService {

    async getSessions() {
        return await persistence.getDeskSessions(10);
    }

    async generateDailySummary(dateStr) {
        // 1. Gather Data
        // dateStr format "YYYY-MM-DD"
        // Since journal uses ISO, we filter roughly
        const entries = await journalService.listEntries();
        const daysEntries = entries.filter(e => e.createdAt.startsWith(dateStr));
        
        if (daysEntries.length === 0) return null;

        const totalR = daysEntries.reduce((sum, e) => sum + (e.resultR || 0), 0);
        const totalPnl = daysEntries.reduce((sum, e) => sum + (e.resultPnl || e.pnl || 0), 0);
        const winCount = daysEntries.filter(e => e.outcome === 'Win').length;
        
        const bestTrade = daysEntries.reduce((best, e) => (e.resultR || 0) > (best?.resultR || -999) ? e : best, null);
        
        // 2. Generate Narrative via LLM
        const prompt = `
        You are the Chief of Staff for a trading desk.
        Write a concise, professional end-of-day summary for ${dateStr}.
        
        Stats:
        - Total Trades: ${daysEntries.length}
        - Net R: ${totalR.toFixed(2)}R
        - Net PnL: $${totalPnl.toFixed(2)}
        - Win Rate: ${Math.round((winCount/daysEntries.length)*100)}%
        
        Highlight Trade: ${bestTrade ? `${bestTrade.symbol} ${bestTrade.direction} (${bestTrade.playbook}) for ${bestTrade.resultR}R` : 'None'}
        
        Narrative style: "Monday started slow with chop in London, but NY Open provided a clean break on US30..."
        Keep it under 3 sentences. Focus on behavior and playbook execution.
        `;

        const summary = await callLLM({
            provider: 'openai',
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.4
        });

        // 3. Save
        const sessionRec = {
            id: `sess_${dateStr}`,
            date: dateStr,
            startTime: daysEntries[daysEntries.length - 1].createdAt, // oldest
            endTime: daysEntries[0].createdAt, // newest
            summary: summary.trim(),
            tags: totalR > 0 ? "Green Day" : "Red Day",
            stats: { totalR, totalPnl, tradeCount: daysEntries.length },
            rawEvents: daysEntries.map(e => ({ type: 'trade', id: e.id, r: e.resultR }))
        };

        await persistence.saveDeskSession(sessionRec);
        return sessionRec;
    }
}

module.exports = new SessionSummaryService();

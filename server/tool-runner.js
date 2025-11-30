// server/tool-runner.js

/**
 * Creates a runner function that has closure access to the server's session state.
 * @param {Map} sessions - Broker sessions map
 * @param {Map} journals - Journal entries map
 */
function createToolRunner(sessions, journals, reqContext) {
  return async (toolName, args) => {
    console.log(`[ToolRunner] Executing ${toolName} with`, args);

    // Context Helpers
    const getSession = (id) => {
      const sid = id || reqContext.brokerSessionId;
      if (!sid || !sessions.has(sid)) return null;
      return sessions.get(sid);
    };

    const getJournal = (id) => {
      const sid = id || reqContext.journalSessionId;
      if (!sid) return [];
      return journals.get(sid) || [];
    };

    // --- TOOL IMPLEMENTATIONS ---

    if (toolName === 'get_broker_state') {
      const session = getSession(args.accountId); // args.accountId might be session id in this simplified logic, or we look it up
      // In this app, we map 'accountId' in args to the sessionId for simplicity, 
      // or we assume the context's session is what we want.
      if (!session) return "No broker session connected.";
      
      return JSON.stringify({
        accountId: session.accountId,
        balance: 10000, // In a real app we'd fetch fresh data
        server: session.server,
        isDemo: session.isDemo
      });
    }

    if (toolName === 'get_open_positions') {
      const session = getSession(args.accountId);
      if (!session) return "No broker session found.";
      
      // In a real implementation we would call the TradeLocker API here using session.accessToken
      // For now, we return the cached positions if available or empty
      const positions = Object.values(session.lastPositionsById || {});
      const filtered = args.symbol 
        ? positions.filter(p => p.symbol.includes(args.symbol))
        : positions;
        
      if (filtered.length === 0) return "No open positions.";
      return JSON.stringify(filtered);
    }

    if (toolName === 'get_journal_entries') {
      const entries = getJournal(null); // use context journal ID
      const recent = entries.slice(0, args.limit || 5).map(e => ({
        timestamp: e.timestamp,
        symbol: e.focusSymbol,
        bias: e.bias,
        outcome: e.outcome,
        note: e.note,
        tags: e.tags
      }));
      return JSON.stringify(recent);
    }

    if (toolName === 'write_journal_entry') {
      // In a real app, we'd invoke the creation logic
      // This is a stub simulation
      return `Created journal entry: "${args.title}" with tags [${args.tags?.join(', ')}]`;
    }

    if (toolName === 'fetch_url_html') {
      // Stub for safety
      return `Fetched content from ${args.url}: (Simulated external content)`;
    }

    if (toolName === 'get_playbook_stats') {
        return JSON.stringify({
            playbook: args.playbookName,
            winRate: 0.65,
            avgRR: 2.1,
            sampleSize: 42,
            note: "Simulated stats"
        });
    }
    
    if (toolName === 'save_playbook_variant') {
        return "Playbook variant saved successfully.";
    }

    return `Tool ${toolName} not implemented or failed.`;
  };
}

module.exports = { createToolRunner };


// server/agents/llmRouter.js

const {
  agentsById,
  GLOBAL_ANALYST_SYSTEM_PROMPT,
} = require("./agentConfig");
const { runAgentWithTools, brokerAndJournalTools } = require('../ai-providers');
const { createRuntimeContext } = require('../tool-runner');

const JSON_RESPONSE_INSTRUCTION = `
You MUST respond with pure JSON (no markdown, no backticks).

Expected structure:
{
  "answer": "Your natural language response here...",
  "journalDraft": {
    "title": "Short setup name",
    "summary": "Detailed reasoning",
    "tags": ["Tag1", "Tag2"],
    "sentiment": "Bullish" | "Bearish" | "Neutral",
    "symbol": "US30",
    "direction": "long" | "short",
    "outcome": "Open" | "Win" | "Loss" | "BE"
  },
  "tradeMeta": {
    "symbol": "US30",
    "timeframe": "15m",
    "direction": "long" | "short",
    "rr": 2.5,
    "entryComment": "Entry reasoning",
    "stopLoss": 12345.5,
    "takeProfit1": 12355.5,
    "takeProfit2": 12365.5,
    "confidence": 85
  }
}
Note: "journalDraft" and "tradeMeta" are optional. Only include them if you have a specific trade idea or lesson.
`;

/**
 * Build the instruction the model sees (system-style).
 */
function buildSystemPrompt(agentCfg, journalMode, chartContext, journalContext, squadContext) {
  const contextBlock = [
    `CONTEXT:`,
    `- Journal mode: ${journalMode}`,
    `- Chart / market context (JSON): ${JSON.stringify(chartContext || {}).slice(0, 3000)}`,
    `- Recent journal context (JSON, truncated): ${JSON.stringify(journalContext || []).slice(0, 3000)}`,
    `- Other agents' notes this round (JSON): ${JSON.stringify(squadContext || []).slice(0, 3000)}`
  ].join("\n");

  let modeInstruction = "";
  if (agentCfg.id === 'journal_coach') {
     modeInstruction = journalMode === "post_trade"
        ? `MODE: POST-TRADE REVIEW. The trade ALREADY HAPPENED. Set "outcome" to Win/Loss/BE.`
        : `MODE: LIVE / PRE-TRADE. "outcome" can be "Open".`;
  }

  return [
    GLOBAL_ANALYST_SYSTEM_PROMPT,
    `You are "${agentCfg.name}".`,
    `ROLE: ${agentCfg.journalStyle}`, 
    modeInstruction,
    contextBlock,
    JSON_RESPONSE_INSTRUCTION
  ].join("\n\n");
}

function safeJsonParse(text) {
  try {
    const clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(clean);
  } catch (e) {
    return null;
  }
}

/**
 * Main entry point: run a turn for multiple agents in SEQUENTIAL order.
 * Now takes `db` instead of Maps.
 */
async function runAgentsTurn(opts) {
  const { 
      agentIds, 
      userMessage, 
      chartContext, 
      journalContext, 
      screenshot, 
      journalMode = "live", 
      agentOverrides,
      db, // PASSED DB INSTANCE
      accountId 
  } = opts;

  const results = [];
  
  for (const id of agentIds) {
      let agentCfg = { ...agentsById[id] };
      
      if (agentOverrides && agentOverrides[id]) {
        agentCfg = { ...agentCfg, ...agentOverrides[id] };
      }

      if (!agentCfg || !agentCfg.id) {
          results.push({
              agentId: id,
              agentName: id,
              error: `Unknown agentId: ${id}`
          });
          continue;
      }

      const squadContext = results.map(r => ({
          agentId: r.agentId,
          agentName: r.agentName,
          message: r.text,
          tradeMeta: r.tradeMeta
      }));

      try {
        // 1. Create Runtime Context (Tools access real DB)
        const ctx = createRuntimeContext(db, {
            brokerSessionId: accountId,
            journalSessionId: accountId, 
            symbol: chartContext.symbol || 'US30'
        });

        const systemPrompt = buildSystemPrompt(agentCfg, journalMode, chartContext, journalContext, squadContext);

        const visionImages = screenshot ? [{ mimeType: "image/jpeg", data: screenshot.replace(/^data:image\/\w+;base64,/, "") }] : undefined;

        const agentReq = {
            agent: { 
                ...agentCfg, 
                systemPrompt, 
                forceJson: true,
                thinkingConfig: agentCfg.thinkingBudget ? { thinkingBudget: agentCfg.thinkingBudget } : undefined
            },
            messages: [{ role: 'user', content: userMessage }],
            tools: brokerAndJournalTools, 
            visionImages
        };

        const llmResult = await runAgentWithTools(agentReq, ctx);
        const parsed = safeJsonParse(llmResult.finalText);
        
        const finalOutput = parsed || { answer: llmResult.finalText };

        if (finalOutput.journalDraft) {
            finalOutput.journalDraft.agentId = agentCfg.id;
            finalOutput.journalDraft.agentName = agentCfg.name;
        }

        results.push({
          agentId: agentCfg.id,
          agentName: agentCfg.name,
          text: finalOutput.answer || JSON.stringify(finalOutput),
          journalDraft: finalOutput.journalDraft || null,
          tradeMeta: finalOutput.tradeMeta || null,
          toolCalls: llmResult.toolResults 
        });

      } catch (err) {
        console.error(`[llmRouter] Error in agent ${id}:`, err);
        results.push({
          agentId: agentCfg.id,
          agentName: agentCfg.name,
          error: err.message,
        });
      }
  }

  return results;
}

async function runAgentsDebrief(opts) {
  const { previousInsights, chartContext, journalContext, agentOverrides, db, accountId } = opts;
  const results = [];

  const activeAgentIds = ["quant_bot", "trend_master", "pattern_gpt", "journal_coach"];

  const baseMessage = `
The user has not added any new message.
This is a SECOND-ROUND internal discussion between agents.
Participate in the roundtable debrief. Read "squadContext".
1. ONLY respond if you have something NEW.
2. Tighten trade levels in tradeMeta.
3. Summarize consensus.
  `.trim();

  const squadContext = previousInsights.map(r => ({
      agentId: r.agentId,
      agentName: r.agentName,
      message: r.message,
      tradeMeta: r.tradeMeta
  }));

  for (const id of activeAgentIds) {
      let agentCfg = { ...agentsById[id] };
      
      if (agentOverrides && agentOverrides[id]) {
         agentCfg = { ...agentCfg, ...agentOverrides[id] };
      }
      
      if (!agentCfg || !agentCfg.id) continue;

      try {
        const ctx = createRuntimeContext(db, {
             brokerSessionId: accountId,
             journalSessionId: accountId,
             symbol: chartContext.symbol || 'US30'
        });

        const systemPrompt = buildSystemPrompt(agentCfg, "live", chartContext, journalContext, squadContext);

        const agentReq = {
            agent: { ...agentCfg, systemPrompt, forceJson: true },
            messages: [{ role: 'user', content: baseMessage }],
            tools: brokerAndJournalTools
        };

        const llmResult = await runAgentWithTools(agentReq, ctx);
        const parsed = safeJsonParse(llmResult.finalText);
        const finalOutput = parsed || { answer: llmResult.finalText };

        if (finalOutput.journalDraft) {
            finalOutput.journalDraft.agentId = agentCfg.id;
            finalOutput.journalDraft.agentName = agentCfg.name;
        }

        results.push({
          agentId: agentCfg.id,
          agentName: agentCfg.name,
          text: finalOutput.answer || JSON.stringify(finalOutput),
          journalDraft: finalOutput.journalDraft || null,
          tradeMeta: finalOutput.tradeMeta || null,
          toolCalls: llmResult.toolResults
        });

      } catch (err) {
        console.error(`[llmRouter] Debrief error in agent ${id}:`, err);
        results.push({
          agentId: agentCfg.id,
          agentName: agentCfg.name,
          error: err.message
        });
      }
  }

  return results;
}

module.exports = {
  runAgentsTurn,
  runAgentsDebrief
};
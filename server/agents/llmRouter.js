




// server/agents/llmRouter.js

const {
  agentsById,
  GLOBAL_ANALYST_SYSTEM_PROMPT,
} = require("./agentConfig");

// Lazy clients so the server can still boot if keys are missing.
let openaiClient = null;
let geminiClient = null;

function getOpenAiApiKey() {
  return process.env.OPENAI_API_KEY || process.env.API_KEY;
}

function getGeminiApiKey() {
  return process.env.API_KEY; // Strictly use process.env.API_KEY for Gemini
}

/**
 * Get OpenAI client.
 */
async function getOpenAI() {
  const key = getOpenAiApiKey();
  if (!key) return null;
  if (!openaiClient) {
    const OpenAI = (await import("openai")).default;
    openaiClient = new OpenAI({
      apiKey: key,
    });
  }
  return openaiClient;
}

/**
 * Get Gemini client.
 * Strictly uses process.env.API_KEY via named parameter initialization.
 */
async function getGemini() {
  const key = getGeminiApiKey();
  if (!key) return null;
  if (!geminiClient) {
    const { GoogleGenAI } = await import("@google/genai");
    geminiClient = new GoogleGenAI({
      apiKey: key,
    });
  }
  return geminiClient;
}

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

  // Specific logic for Journal Coach to enforce mode behavior
  let modeInstruction = "";
  if (agentCfg.id === 'journal_coach') {
     modeInstruction = journalMode === "post_trade"
        ? `MODE: POST-TRADE REVIEW. The trade ALREADY HAPPENED. Set "outcome" to Win/Loss/BE.`
        : `MODE: LIVE / PRE-TRADE. "outcome" can be "Open".`;
  }

  return [
    GLOBAL_ANALYST_SYSTEM_PROMPT,
    `You are "${agentCfg.name}".`,
    `ROLE: ${agentCfg.journalStyle}`, // Using journalStyle as the role/description slot
    modeInstruction,
    contextBlock,
    JSON_RESPONSE_INSTRUCTION
  ].join("\n\n");
}

function safeJsonParse(text) {
  try {
    // Attempt to clean markdown code blocks if present
    const clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(clean);
  } catch (e) {
    return null;
  }
}

/**
 * Build user message text.
 */
function buildUserText({ userMessage }) {
  return `User prompt: ${userMessage}`;
}

/**
 * For OpenAI: build a multi-modal user message (text + optional image).
 */
function buildOpenAIUserMessage({ userMessage, screenshot }) {
  const text = buildUserText({ userMessage });
  const hasImage = screenshot && screenshot.trim().length > 0;

  if (!hasImage) {
    return { role: "user", content: text };
  }

  return {
    role: "user",
    content: [
      { type: "text", text },
      {
        type: "image_url",
        image_url: {
          url: screenshot,
        },
      },
    ],
  };
}

/**
 * For Gemini: build multi-modal content parts.
 */
function buildGeminiContents({ userMessage, screenshot }) {
  const text = buildUserText({ userMessage });
  const parts = [{ text }];

  if (screenshot && screenshot.startsWith("data:")) {
    const base64 = screenshot.split(",")[1] || "";
    if (base64) {
      parts.push({
        inlineData: {
          mimeType: "image/png", // Assuming PNG or JPEG, API is flexible usually
          data: base64,
        },
      });
    }
  }

  return parts;
}

/**
 * Run one agent using OpenAI.
 */
async function runOpenAIAgent(agentCfg, { userMessage, chartContext, journalContext, squadContext, screenshot, journalMode }) {
  const openai = await getOpenAI();
  if (!openai) {
    return { text: "Error: OpenAI API key is not configured on server.", journalDraft: null };
  }

  const systemPrompt = buildSystemPrompt(agentCfg, journalMode, chartContext, journalContext, squadContext);
  const messages = [
    { role: "system", content: systemPrompt },
    buildOpenAIUserMessage({ userMessage, screenshot }),
  ];

  try {
    const completion = await openai.chat.completions.create({
      model: agentCfg.model,
      messages,
      temperature: agentCfg.temperature ?? 0.6,
      response_format: { type: "json_object" } // Force JSON
    });

    const choice = completion.choices[0];
    const content = choice.message?.content || "";
    const parsed = safeJsonParse(content);

    if (parsed) {
        return {
            text: parsed.answer || JSON.stringify(parsed),
            journalDraft: parsed.journalDraft || null,
            tradeMeta: parsed.tradeMeta || null
        };
    }

    return { text: content, journalDraft: null, tradeMeta: null };
  } catch (err) {
    return { text: `Error calling OpenAI: ${err.message}`, journalDraft: null, tradeMeta: null };
  }
}

/**
 * Run one agent using Gemini.
 */
async function runGeminiAgent(agentCfg, { userMessage, chartContext, journalContext, squadContext, screenshot, journalMode }) {
  const ai = await getGemini();
  if (!ai) {
    return { text: "Error: Gemini API key is not configured on server.", journalDraft: null };
  }

  try {
    const parts = buildGeminiContents({ userMessage, screenshot });
    const systemPrompt = buildSystemPrompt(agentCfg, journalMode, chartContext, journalContext, squadContext);

    // Apply Thinking Config if defined in agentConfig
    // Crucial for Live Trading Reasoning
    let thinkingConfig = undefined;
    if (agentCfg.thinkingBudget) {
      thinkingConfig = { thinkingBudget: agentCfg.thinkingBudget };
    }

    const result = await ai.models.generateContent({
      model: agentCfg.model || 'gemini-2.5-flash',
      contents: {
        role: 'user',
        parts: parts
      },
      config: {
        systemInstruction: systemPrompt,
        temperature: agentCfg.temperature ?? 0.6,
        responseMimeType: "application/json", // Force JSON
        thinkingConfig: thinkingConfig,
      }
    });

    const text = result.text || "";
    const parsed = safeJsonParse(text);

    if (parsed) {
        return {
            text: parsed.answer || JSON.stringify(parsed),
            journalDraft: parsed.journalDraft || null,
            tradeMeta: parsed.tradeMeta || null
        };
    }

    return { text: text, journalDraft: null, tradeMeta: null };
  } catch (err) {
    console.error("Gemini Error:", err);
    return { text: `Error calling Gemini: ${err.message}`, journalDraft: null, tradeMeta: null };
  }
}

/**
 * Main entry point: run a turn for multiple agents in SEQUENTIAL order so they can see squadContext.
 */
async function runAgentsTurn(opts) {
  const { agentIds, userMessage, chartContext, journalContext, screenshot, journalMode = "live", agentOverrides } = opts;

  const results = [];
  
  // We run agents one by one
  for (const id of agentIds) {
      let agentCfg = { ...agentsById[id] };
      
      // Apply overrides if any
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

      // Squad Context is what previous agents have said
      const squadContext = results.map(r => ({
          agentId: r.agentId,
          agentName: r.agentName,
          message: r.text,
          tradeMeta: r.tradeMeta
      }));

      try {
        const payload = { 
            userMessage, 
            chartContext, 
            journalContext, 
            squadContext, 
            screenshot, 
            journalMode
        };
        
        let llmResult;
        if (agentCfg.provider === "openai") {
          llmResult = await runOpenAIAgent(agentCfg, payload);
        } else if (agentCfg.provider === "gemini") {
          llmResult = await runGeminiAgent(agentCfg, payload);
        } else {
          // Fallback or error
           llmResult = { text: "Error: Unsupported provider", journalDraft: null };
        }

        // Add journalDraft agent info mapping here if needed, or in the UI
        if (llmResult.journalDraft) {
            llmResult.journalDraft.agentId = agentCfg.id;
            llmResult.journalDraft.agentName = agentCfg.name;
        }

        results.push({
          agentId: agentCfg.id,
          agentName: agentCfg.name,
          text: llmResult.text,
          journalDraft: llmResult.journalDraft,
          tradeMeta: llmResult.tradeMeta
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

/**
 * Run a debrief round where agents react to previous insights.
 */
async function runAgentsDebrief(opts) {
  const { previousInsights, chartContext, journalContext, agentOverrides } = opts;
  const results = [];

  // We want active agents from the previous round or a standard set. 
  const activeAgentIds = ["quant_bot", "trend_master", "pattern_gpt", "journal_coach"];

  const baseMessage = `
The user has not added any new message.

This is a SECOND-ROUND internal discussion between agents.

You are participating in a roundtable debrief. Read the previous agents' notes in "squadContext" and:

1. ONLY respond if you have something NEW, clarifying, or contradictory to add.
2. You may:
   - Tighten or adjust trade levels in tradeMeta.
   - Call out major disagreement with another agent.
   - Summarize consensus if things are aligned.
3. Be concise but useful.

Remember: respond in the same JSON format (AgentResponse) as before.
  `.trim();

  // Squad Context is the previous round
  const squadContext = previousInsights.map(r => ({
      agentId: r.agentId,
      agentName: r.agentName,
      message: r.message,
      tradeMeta: r.tradeMeta
  }));

  for (const id of activeAgentIds) {
      let agentCfg = { ...agentsById[id] };
      
      // Apply overrides if any
      if (agentOverrides && agentOverrides[id]) {
         agentCfg = { ...agentCfg, ...agentOverrides[id] };
      }
      
      if (!agentCfg || !agentCfg.id) continue;

      try {
        const payload = {
          userMessage: baseMessage,
          chartContext,
          journalContext,
          squadContext,
          screenshot: null,
          journalMode: "live", // default for debrief
        };

        let llmResult;
        if (agentCfg.provider === "openai") {
          llmResult = await runOpenAIAgent(agentCfg, payload);
        } else if (agentCfg.provider === "gemini") {
          llmResult = await runGeminiAgent(agentCfg, payload);
        } else {
           llmResult = { text: "Error: Unsupported provider", journalDraft: null };
        }

        if (llmResult.journalDraft) {
            llmResult.journalDraft.agentId = agentCfg.id;
            llmResult.journalDraft.agentName = agentCfg.name;
        }

        results.push({
          agentId: agentCfg.id,
          agentName: agentCfg.name,
          text: llmResult.text,
          journalDraft: llmResult.journalDraft,
          tradeMeta: llmResult.tradeMeta
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

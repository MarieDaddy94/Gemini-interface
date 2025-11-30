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
  return process.env.GEMINI_API_KEY || process.env.API_KEY;
}

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

/**
 * Extract JOURNAL_JSON {...} from an LLM answer.
 * The model is instructed to end with a line starting with JOURNAL_JSON: and a JSON object.
 */
function extractJournalFromText(rawText, agentCfg) {
  if (!rawText) return { cleanText: "", journalDraft: null };

  const marker = "JOURNAL_JSON:";
  const idx = rawText.indexOf(marker);
  if (idx === -1) {
    return { cleanText: rawText.trim(), journalDraft: null };
  }

  const main = rawText.slice(0, idx).trim();
  const after = rawText.slice(idx + marker.length).trim();

  // Try to grab a well-formed JSON object by matching braces.
  let jsonStr = after;
  let depth = 0;
  let endIdx = -1;
  for (let i = 0; i < after.length; i++) {
    const ch = after[i];
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }
  if (endIdx >= 0) {
    jsonStr = after.slice(0, endIdx + 1);
  }

  try {
    const obj = JSON.parse(jsonStr);
    const draft = {
      agentId: agentCfg.id,
      agentName: agentCfg.name,
      title: String(obj.title || "").slice(0, 140),
      summary: String(obj.summary || "").slice(0, 2000),
      sentiment: obj.sentiment || "neutral",
      tags: Array.isArray(obj.tags) ? obj.tags.map(String) : [],
    };
    return { cleanText: main, journalDraft: draft };
  } catch (err) {
    console.warn(
      `[llmRouter] Failed to parse JOURNAL_JSON from ${agentCfg.id}:`,
      err.message
    );
    return { cleanText: rawText.trim(), journalDraft: null };
  }
}

/**
 * Build the instruction the model sees (system-style).
 */
function buildSystemPrompt(agentCfg) {
  return [
    GLOBAL_ANALYST_SYSTEM_PROMPT,
    `You are the "${agentCfg.name}" agent. Your specialization:`,
    agentCfg.journalStyle,
    `
At the very end of your answer, output exactly one line starting with:
JOURNAL_JSON: { ... }

The JSON object MUST contain:
- "title": short string
- "summary": string
- "sentiment": one of ["bullish","bearish","neutral","mixed"]
- "tags": array of strings

Do NOT explain the JSON. Do NOT put it in a code block.
    `.trim(),
  ].join("\n\n");
}

/**
 * Build user message text that combines the raw question + chart context.
 */
function buildUserText({ userMessage, chartContext }) {
  const base = [
    `User prompt: ${userMessage}`,
    chartContext
      ? `Chart context / notes:\n${chartContext}`
      : `Chart context: (none provided)`,
  ].join("\n\n");
  return base;
}

/**
 * For OpenAI: build a multi-modal user message (text + optional image).
 */
function buildOpenAIUserMessage({ userMessage, chartContext, screenshot }) {
  const text = buildUserText({ userMessage, chartContext });
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
          // e.g. "data:image/png;base64,...."
          url: screenshot,
        },
      },
    ],
  };
}

/**
 * For Gemini: build multi-modal content parts (text + optional inlineData image).
 */
function buildGeminiParts({ userMessage, chartContext, screenshot }) {
  const parts = [{ text: buildUserText({ userMessage, chartContext }) }];

  if (screenshot && screenshot.startsWith("data:")) {
    // Strip "data:image/png;base64," prefix for inlineData
    const base64 = screenshot.split(",")[1] || "";
    if (base64) {
      parts.push({
        inlineData: {
          mimeType: "image/png",
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
async function runOpenAIAgent(agentCfg, { userMessage, chartContext, screenshot }) {
  const openai = await getOpenAI();
  if (!openai) {
    // Return a dummy response if no key, to prevent crash
    return { text: "Error: OpenAI API key is not configured.", journalDraft: null };
  }

  const systemPrompt = buildSystemPrompt(agentCfg);
  const messages = [
    { role: "system", content: systemPrompt },
    buildOpenAIUserMessage({ userMessage, chartContext, screenshot }),
  ];

  try {
    const completion = await openai.chat.completions.create({
      model: agentCfg.model,
      messages,
      temperature: agentCfg.temperature ?? 0.6,
    });

    const choice = completion.choices[0];
    const content = choice.message?.content || "";
    const { cleanText, journalDraft } = extractJournalFromText(
      typeof content === "string" ? content : String(content),
      agentCfg
    );

    return { text: cleanText, journalDraft };
  } catch (err) {
    return { text: `Error calling OpenAI: ${err.message}`, journalDraft: null };
  }
}

/**
 * Run one agent using Gemini.
 */
async function runGeminiAgent(agentCfg, { userMessage, chartContext, screenshot }) {
  const gemini = await getGemini();
  if (!gemini) {
    return { text: "Error: Gemini API key is not configured.", journalDraft: null };
  }

  try {
    const model = gemini.getGenerativeModel({
      model: agentCfg.model,
      systemInstruction: buildSystemPrompt(agentCfg),
    });

    const parts = buildGeminiParts({ userMessage, chartContext, screenshot });

    const result = await model.generateContent({
      contents: [{ role: "user", parts }],
    });

    const text = result.response?.text?.() || "";
    const { cleanText, journalDraft } = extractJournalFromText(text, agentCfg);
    return { text: cleanText, journalDraft };
  } catch (err) {
    return { text: `Error calling Gemini: ${err.message}`, journalDraft: null };
  }
}

/**
 * Main entry point: run a turn for multiple agents in parallel.
 *
 * @param {Object} opts
 * @param {string[]} opts.agentIds  e.g. ["quant_bot","trend_master","pattern_gpt"]
 * @param {string}   opts.userMessage
 * @param {string}   [opts.chartContext]
 * @param {string}   [opts.screenshot]  data URL or undefined
 */
async function runAgentsTurn(opts) {
  const { agentIds, userMessage, chartContext = "", screenshot = null } = opts;

  const results = await Promise.all(
    agentIds.map(async (id) => {
      const agentCfg = agentsById[id];
      if (!agentCfg) {
        return {
          agentId: id,
          agentName: id,
          error: `Unknown agentId: ${id}`,
        };
      }

      try {
        const payload = { userMessage, chartContext, screenshot };
        let llmResult;

        if (agentCfg.provider === "openai") {
          llmResult = await runOpenAIAgent(agentCfg, payload);
        } else if (agentCfg.provider === "gemini") {
          llmResult = await runGeminiAgent(agentCfg, payload);
        } else {
          throw new Error(`Unsupported provider: ${agentCfg.provider}`);
        }

        return {
          agentId: agentCfg.id,
          agentName: agentCfg.name,
          text: llmResult.text,
          journalDraft: llmResult.journalDraft,
        };
      } catch (err) {
        console.error(`[llmRouter] Error in agent ${id}:`, err);
        return {
          agentId: agentCfg.id,
          agentName: agentCfg.name,
          error: err.message,
        };
      }
    })
  );

  return results;
}

module.exports = {
  runAgentsTurn,
};

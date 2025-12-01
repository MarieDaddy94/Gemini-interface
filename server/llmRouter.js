
// server/llmRouter.js
//
// Single place where we talk to OpenAI (GPT-5.1 / mini) and Gemini text models.
// Other code should go through callLLM / callAgentLLM and never hit HTTP directly.

const { getAgentById } = require('./agents/agents');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY;

// Defaults
const DEFAULT_OPENAI_MODEL = 'gpt-4o'; // Mapping "gpt-5.1" to 4o for now as alias
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

/**
 * Low-level OpenAI chat call.
 */
async function callOpenAIChat({
  model,
  systemPrompt,
  messages,
  temperature = 0.4,
  maxTokens = 1024,
}) {
  if (!OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY is not set. Cannot call OpenAI models.'
    );
  }

  const url = 'https://api.openai.com/v1/chat/completions';

  const allMessages = [];
  if (systemPrompt) {
    allMessages.push({ role: 'system', content: systemPrompt });
  }
  if (Array.isArray(messages)) {
    allMessages.push(...messages);
  }

  // Handle aliases for future-proofing
  let useModel = model || DEFAULT_OPENAI_MODEL;
  if (useModel.includes('gpt-5.1')) useModel = 'gpt-4o'; 

  const body = {
    model: useModel,
    messages: allMessages,
    temperature,
    max_tokens: maxTokens,
  };

  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error('[LLMRouter][OpenAI] HTTP error:', err);
    throw new Error('OpenAI request failed (network error).');
  }

  if (!resp.ok) {
    const text = await resp.text();
    console.error(
      `[LLMRouter][OpenAI] API error (${resp.status}): ${resp.statusText} - ${text}`
    );
    throw new Error(
      `OpenAI error: ${resp.status} ${resp.statusText}`
    );
  }

  const json = await resp.json();
  const choice = json.choices && json.choices[0];
  const content = choice && choice.message && choice.message.content;
  if (!content) {
    throw new Error('OpenAI returned no message content.');
  }
  return content;
}

/**
 * Low-level Gemini text call using REST API.
 */
async function callGeminiText({
  model,
  systemPrompt,
  messages,
  temperature = 0.4,
  maxTokens = 1024,
}) {
  if (!GEMINI_API_KEY) {
    throw new Error(
      'GEMINI_API_KEY is not set. Cannot call Gemini text models.'
    );
  }

  const useModel = model || DEFAULT_GEMINI_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    useModel
  )}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  const parts = [];
  // Fold system prompt into the first user message or separate if strictly supported (v1beta often prefers it as config or just prepended)
  // We'll prepend it to context for robustness across versions
  let effectivePrompt = "";
  if (systemPrompt) {
    effectivePrompt += `SYSTEM INSTRUCTION: ${systemPrompt}\n\n`;
  }

  if (Array.isArray(messages)) {
    for (const m of messages) {
      if (m && typeof m.content === 'string' && m.content.trim()) {
        effectivePrompt += `${m.role === 'user' ? 'USER' : 'MODEL'}: ${m.content}\n`;
      }
    }
  }
  effectivePrompt += `\nMODEL:`; // Cue the model

  const body = {
    contents: [{ parts: [{ text: effectivePrompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  };

  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error('[LLMRouter][Gemini] HTTP error:', err);
    throw new Error('Gemini request failed (network error).');
  }

  if (!resp.ok) {
    const text = await resp.text();
    console.error(
      `[LLMRouter][Gemini] API error (${resp.status}): ${resp.statusText} - ${text}`
    );
    throw new Error(
      `Gemini error: ${resp.status} ${resp.statusText}`
    );
  }

  const json = await resp.json();
  const candidates = json.candidates || [];
  const first = candidates[0];
  if (!first || !first.content || !Array.isArray(first.content.parts)) {
    throw new Error('Gemini returned no content.');
  }

  const textParts = first.content.parts
    .map((p) => p.text || '')
    .filter(Boolean)
    .join('\n');

  return textParts.trim();
}

/**
 * Core router.
 * 
 * opts:
 *   - provider: 'openai' | 'gemini' | 'auto' (optional)
 *   - model: string (optional)
 *   - agentId: string (optional) – uses AGENTS map
 *   - systemPrompt, messages, temperature, maxTokens
 */
async function callLLM(opts) {
  const {
    provider,
    model,
    agentId,
    systemPrompt,
    messages,
    temperature,
    maxTokens,
  } = opts || {};

  let useProvider = provider || 'auto';
  let useModel = model || null;

  if (agentId) {
    const agent = getAgentById(agentId);
    if (agent) {
      if (!useProvider || useProvider === 'auto') useProvider = agent.provider || 'openai';
      if (!useModel) useModel = agent.model;
    }
  }

  // If still on 'auto', infer from model name.
  if (useProvider === 'auto') {
    if (useModel && useModel.startsWith('gemini')) {
      useProvider = 'gemini';
    } else {
      useProvider = 'openai';
    }
  }

  if (useProvider === 'gemini') {
    return callGeminiText({
      model: useModel || DEFAULT_GEMINI_MODEL,
      systemPrompt,
      messages,
      temperature,
      maxTokens,
    });
  }

  // default: openai
  return callOpenAIChat({
    model: useModel || DEFAULT_OPENAI_MODEL,
    systemPrompt,
    messages,
    temperature,
    maxTokens,
  });
}

/**
 * Convenience wrapper when you know the agentId.
 */
async function callAgentLLM({
  agentId,
  systemPrompt,
  messages,
  temperature,
  maxTokens,
}) {
  if (!agentId) {
    throw new Error('agentId is required for callAgentLLM.');
  }

  return callLLM({
    agentId,
    systemPrompt,
    messages,
    temperature,
    maxTokens,
  });
}

module.exports = {
  callLLM,
  callAgentLLM,
};

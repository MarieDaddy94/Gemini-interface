
// server/llmRouter.js
//
// Unified LLM router for GPT-5.1 (OpenAI) + Gemini models.
//
// Requires:
// - process.env.OPENAI_API_KEY (for GPT-5.1 / other OpenAI models)
// - process.env.GEMINI_API_KEY (for Gemini models)
//
// NOTE: This file assumes Node 18+ with global fetch available.

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY;

// ------------------------------
// Helpers: message conversion
// ------------------------------

/**
 * Convert chat messages into OpenAI chat format.
 * @param {Array<{role: 'user'|'assistant'|'system', content: string}>} messages
 * @param {string | undefined} systemPrompt
 * @returns {Array<{role: string, content: string}>}
 */
function buildOpenAIMessages(messages, systemPrompt) {
  const result = [];

  if (systemPrompt) {
    result.push({
      role: 'system',
      content: systemPrompt,
    });
  }

  for (const m of messages) {
    result.push({
      role: m.role,
      content: m.content,
    });
  }

  return result;
}

/**
 * Convert chat messages into Gemini "contents" format.
 * @param {Array<{role: 'user'|'assistant'|'system', content: string}>} messages
 * @param {string | undefined} systemPrompt
 * @returns {{systemInstruction?: any, contents: any[]}}
 */
function buildGeminiPayload(messages, systemPrompt) {
  const contents = [];

  for (const m of messages) {
    if (m.role === 'system') {
      // We'll fold system content into systemInstruction instead.
      continue;
    }

    // Gemini roles: 'user' or 'model'
    const role = m.role === 'assistant' ? 'model' : 'user';

    contents.push({
      role,
      parts: [
        {
          text: m.content,
        },
      ],
    });
  }

  const payload = { contents };

  if (systemPrompt) {
    payload.systemInstruction = {
      role: 'user', // Gemini flash sometimes prefers system instruction as a user prompt or system role if supported
      parts: [{ text: systemPrompt }],
    };
    // If model supports explicit system role in systemInstruction, use that, but flash often takes it as config.
    // We'll assume v1beta standard structure:
    payload.systemInstruction = {
        parts: [ { text: systemPrompt } ]
    };
  }

  return payload;
}

// ------------------------------
// OpenAI (GPT-5.1 etc.)
// ------------------------------

async function callOpenAIChat(options) {
  const {
    model = 'gpt-5.1',
    systemPrompt,
    messages,
    temperature = 0.3,
    maxTokens = 1024,
  } = options;

  if (!OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY is not set. Set it in your environment to use GPT-5.1.'
    );
  }

  const body = {
    model,
    messages: buildOpenAIMessages(messages, systemPrompt),
    temperature,
    max_tokens: maxTokens,
  };

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(
      `OpenAI API error (${resp.status}): ${resp.statusText} - ${errText}`
    );
  }

  const json = await resp.json();

  const text =
    json &&
    json.choices &&
    json.choices[0] &&
    json.choices[0].message &&
    json.choices[0].message.content;

  return text || '';
}

// ------------------------------
// Gemini (text-only for now)
// ------------------------------

async function callGeminiText(options) {
  const {
    model = 'gemini-2.5-flash',
    systemPrompt,
    messages,
    temperature = 0.3,
    maxTokens = 1024,
  } = options;

  if (!GEMINI_API_KEY) {
    throw new Error(
      'GEMINI_API_KEY is not set. Set it in your environment to use Gemini.'
    );
  }

  const { contents, systemInstruction } = buildGeminiPayload(
    messages,
    systemPrompt
  );

  const body = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  };

  if (systemInstruction) {
    body.systemInstruction = systemInstruction;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(
      `Gemini API error (${resp.status}): ${resp.statusText} - ${errText}`
    );
  }

  const json = await resp.json();

  const candidates = json.candidates || [];
  const first = candidates[0];

  if (
    !first ||
    !first.content ||
    !first.content.parts ||
    first.content.parts.length === 0
  ) {
    return '';
  }

  const textPart = first.content.parts.find((p) => typeof p.text === 'string');

  return textPart ? textPart.text : '';
}

// ------------------------------
// Public router
// ------------------------------

/**
 * Generic LLM router.
 *
 * @param {{
 *   model?: string,
 *   provider?: 'openai' | 'gemini' | 'auto',
 *   systemPrompt?: string,
 *   messages: Array<{role: 'user'|'assistant'|'system', content: string}>,
 *   temperature?: number,
 *   maxTokens?: number
 * }} options
 * @returns {Promise<string>}
 */
async function callLLM(options) {
  const {
    model,
    provider = 'auto',
    systemPrompt,
    messages,
    temperature,
    maxTokens,
  } = options;

  // Decide provider if "auto"
  let chosenProvider = provider;
  if (provider === 'auto') {
    if (model && model.startsWith('gemini')) {
      chosenProvider = 'gemini';
    } else if (model && model.startsWith('gpt-')) {
      chosenProvider = 'openai';
    } else if (GEMINI_API_KEY) {
      chosenProvider = 'gemini';
    } else if (OPENAI_API_KEY) {
      chosenProvider = 'openai';
    } else {
      throw new Error(
        'No LLM provider available. Set GEMINI_API_KEY and/or OPENAI_API_KEY.'
      );
    }
  }

  if (chosenProvider === 'openai') {
    return callOpenAIChat({
      model: model || 'gpt-5.1',
      systemPrompt,
      messages,
      temperature,
      maxTokens,
    });
  }

  // Default to Gemini
  return callGeminiText({
    model: model || 'gemini-2.5-flash',
    systemPrompt,
    messages,
    temperature,
    maxTokens,
  });
}

module.exports = {
  callLLM,
};

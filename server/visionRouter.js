const express = require('express');

const visionRouter = express.Router();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Helper: choose provider if "auto"
function resolveProvider(inputProvider) {
  if (inputProvider && inputProvider !== 'auto') return inputProvider;
  // Default strategy: prefer Gemini since this app started from AI Studio
  if (GEMINI_API_KEY) return 'gemini';
  if (OPENAI_API_KEY) return 'openai';
  throw new Error('No vision provider API key configured.');
}

// -----------------------------
// Gemini Vision Call
// -----------------------------
async function callGeminiVision({ modelId, prompt, images }) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set.');
  }

  // images: array of base64 strings "data:image/png;base64,..." or raw base64
  const imageParts = (images || []).map((img) => {
    if (!img) return null;
    const isDataUrl = img.startsWith('data:');
    const base64 = isDataUrl ? img.split(',')[1] : img;
    return {
      inline_data: {
        mime_type: 'image/png',
        data: base64,
      },
    };
  }).filter(Boolean);

  const body = {
    contents: [
      {
        parts: [
          { text: prompt },
          ...imageParts,
        ],
      },
    ],
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error: ${res.status} ${text}`);
  }

  const json = await res.json();
  const candidates = json.candidates || [];
  const first = candidates[0];
  const parts = first?.content?.parts || [];
  const textParts = parts
    .map((p) => p.text)
    .filter(Boolean)
    .join('\n');

  return textParts || '';
}

// -----------------------------
// OpenAI Vision Call
// -----------------------------
async function callOpenAIVision({ modelId, prompt, images }) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set.');
  }

  // We'll use chat/completions with vision-capable models (gpt-4o, gpt-4.1, etc.)
  const imageContents = (images || []).map((img) => {
    if (!img) return null;
    const url = img.startsWith('data:')
      ? img
      : `data:image/png;base64,${img}`;
    return {
      type: 'image_url',
      image_url: { url },
    };
  }).filter(Boolean);

  const body = {
    model: modelId,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          ...imageContents,
        ],
      },
    ],
  };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${text}`);
  }

  const json = await res.json();
  const choice = json.choices?.[0];
  const content = choice?.message?.content || '';
  return content;
}

// -----------------------------
// POST /api/vision/run
// -----------------------------
// Body:
// {
//   provider: "auto" | "gemini" | "openai",
//   modelId?: string,
//   task: "chart_single" | "chart_mtf" | "live_watch" | "journal",
//   visionContext?: { ... },
//   images?: string[] // base64 or data URLs
// }
visionRouter.post('/run', async (req, res) => {
  try {
    const {
      provider: rawProvider = 'auto',
      modelId,
      task,
      visionContext,
      images,
    } = req.body || {};

    const provider = resolveProvider(rawProvider);

    // Default models depending on provider
    const resolvedModelId =
      modelId ||
      (provider === 'gemini'
        ? 'gemini-2.5-flash'
        : 'gpt-4o-mini');

    // Build a generic prompt that later steps will refine
    const contextSummary = visionContext
      ? `\n\nContext JSON:\n${JSON.stringify(visionContext)}`
      : '';

    const basePrompt = `
You are a trading chart vision assistant. You receive one or more screenshots of charts or trading UIs.
Task: "${task || 'chart_single'}".

Explain clearly what you see and focus on market structure, levels, patterns, risk context, and any useful notes for a trading decision.

Be concise but structured.

${contextSummary}
    `.trim();

    let text;
    if (provider === 'gemini') {
      text = await callGeminiVision({
        modelId: resolvedModelId,
        prompt: basePrompt,
        images,
      });
    } else if (provider === 'openai') {
      text = await callOpenAIVision({
        modelId: resolvedModelId,
        prompt: basePrompt,
        images,
      });
    } else {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    // For Step 1 we just return raw text + metadata.
    // In Steps 2+ we'll parse this into a structured VisionResult.
    res.json({
      provider,
      modelId: resolvedModelId,
      task: task || 'chart_single',
      createdAt: new Date().toISOString(),
      rawText: text,
    });
  } catch (err) {
    console.error('Vision router error:', err);
    res.status(500).json({
      error: 'Vision router failed',
      details: err?.message || String(err),
    });
  }
});

module.exports = {
  visionRouter,
};
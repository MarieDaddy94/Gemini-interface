
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
// Helpers
// -----------------------------

function buildChartVisionPrompt(payload) {
  const {
    symbol,
    timeframe,
    sessionContext,
    question,
    focusLiquidity,
    focusFvg,
    focusTrendStructure,
    focusRiskWarnings,
  } = payload;

  const focusParts = [];
  if (focusTrendStructure) focusParts.push('trend and structure (swing highs/lows, HH/HL vs LH/LL)');
  if (focusLiquidity) focusParts.push('liquidity (equal highs/lows, stop clusters, sweeps)');
  if (focusFvg) focusParts.push('fair value gaps / imbalances');
  if (focusRiskWarnings) focusParts.push('risk warnings (chop, extended moves, news candles)');

  const focusText = focusParts.length
    ? `Focus especially on: ${focusParts.join(', ')}.`
    : 'Give a balanced read of structure, liquidity, FVGs, and risk.';

  return `
You are a professional price action trader with deep experience in indices (US30, NAS100) and XAUUSD.
You are analyzing a screenshot of a chart for symbol "${symbol}" on timeframe "${timeframe}".

Session context: ${sessionContext || '(not specified)'}

The user question or goal:
${question || '(none provided)'}

${focusText}

You MUST respond **only** with a single JSON object in this exact TypeScript shape:

interface ChartVisionAnalysis {
  symbol: string;
  timeframe: string;
  sessionContext?: string;

  marketBias: 'bullish' | 'bearish' | 'choppy' | 'unclear';
  confidence: number; // 0–1

  structureNotes: string;        // trend, HH/HL vs LH/LL, ranges, higher-timeframe context if visible
  liquidityNotes: string;        // equal highs/lows, obvious stop clusters, liquidity sweeps, resting pools
  fvgNotes: string;              // fair value gaps / imbalances worth watching (approximate descriptions)
  keyZones: string[];            // concise labels for key zones: "PDH", "London Low", "NY Open Range High", etc.
  patternNotes: string;          // any classic patterns, internal structure, or clear narrative in price action
  riskWarnings: string[];        // each bullet is a short, actionable warning: "late into move", "news candle just printed"

  suggestedPlaybookTags: string[]; // tags like ["PDH sweep", "NY reversal fade", "London range break"]
}

Requirements:
- All fields must be present.
- "confidence" must be a number between 0 and 1.
- Do NOT include explanations outside of JSON.
- Do NOT wrap the JSON in backticks or any markdown, just plain JSON.
`.trim();
}

function safeExtractJsonObject(text) {
  if (!text) return null;
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }
  const jsonSlice = text.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(jsonSlice);
  } catch (err) {
    console.error('Failed to parse JSON from vision output:', err);
    return null;
  }
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
visionRouter.post('/run', async (req, res) => {
  try {
    const {
      provider: rawProvider = 'auto',
      modelId,
      mode,
      task,
      visionContext,
      images,
      payload, 
    } = req.body || {};

    const provider = resolveProvider(rawProvider);

    const resolvedModelId =
      modelId ||
      (provider === 'gemini'
        ? 'gemini-2.5-flash'
        : 'gpt-4o-mini');

    // ------- Branch 1: Specialized Chart Vision mode -------
    if (mode === 'chart_vision_v1' && payload && payload.imageBase64) {
      const chartTask = 'chart_single';
      const prompt = buildChartVisionPrompt(payload);
      const imageArr = [payload.imageBase64];

      let rawText;
      if (provider === 'gemini') {
        rawText = await callGeminiVision({
          modelId: resolvedModelId,
          prompt,
          images: imageArr,
        });
      } else if (provider === 'openai') {
        rawText = await callOpenAIVision({
          modelId: resolvedModelId,
          prompt,
          images: imageArr,
        });
      } else {
        throw new Error(`Unsupported provider: ${provider}`);
      }

      const parsed = safeExtractJsonObject(rawText);

      // Build ChartVisionResult shape
      const analysis =
        parsed && typeof parsed === 'object'
          ? parsed
          : {
              symbol: payload.symbol,
              timeframe: payload.timeframe,
              sessionContext: payload.sessionContext,
              marketBias: 'unclear',
              confidence: 0,
              structureNotes: rawText || '',
              liquidityNotes: '',
              fvgNotes: '',
              keyZones: [],
              patternNotes: '',
              riskWarnings: [],
              suggestedPlaybookTags: [],
            };

      const summary = `Bias: ${analysis.marketBias.toUpperCase()} (conf ${
        Math.round((analysis.confidence || 0) * 100)
      }%). Key zones: ${(analysis.keyZones || []).slice(0, 3).join(', ') || 'none specified'}.`;

      return res.json({
        provider,
        modelId: resolvedModelId,
        task: chartTask,
        createdAt: new Date().toISOString(),
        rawText,
        summary,
        analysis,
      });
    }

    // ------- Branch 2: Generic vision (fallback) -------
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

    res.json({
      provider,
      modelId: resolvedModelId,
      task: task || 'chart_single',
      createdAt: new Date().toISOString(),
      rawText: text,
      summary: 'Unstructured vision response (generic mode).',
      analysis: {
        symbol: visionContext?.instrument || 'unknown',
        timeframe: visionContext?.frames?.[0]?.timeframe || 'unknown',
        sessionContext: visionContext?.sessionContext || undefined,
        marketBias: 'unclear',
        confidence: 0,
        structureNotes: text,
        liquidityNotes: '',
        fvgNotes: '',
        keyZones: [],
        patternNotes: '',
        riskWarnings: [],
        suggestedPlaybookTags: [],
      },
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

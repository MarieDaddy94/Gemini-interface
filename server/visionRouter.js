


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

function buildMtfVisionPrompt(payload) {
  const {
    symbol,
    frames, // [{ timeframe: string, note?: string }]
    sessionContext,
    question,
  } = payload;

  const frameLines = (frames || []).map((f, idx) => {
    return `Frame ${idx + 1}: timeframe="${f.timeframe}", note="${f.note || ''}"`;
  });

  return `
You are a professional multi-timeframe price action trader.
You will receive multiple chart screenshots for the SAME symbol "${symbol}" across different timeframes.

Frames provided:
${frameLines.join('\n') || '(none listed)'}

Session context: ${sessionContext || '(not specified)'}

User question or goal:
${question || '(none provided)'}

You MUST respond ONLY with a single JSON object that conforms to this TypeScript interface:

interface ChartVisionAnalysis {
  symbol: string;
  timeframe: string;             // choose the primary execution TF (e.g. 1m/5m/15m)
  sessionContext?: string;

  marketBias: 'bullish' | 'bearish' | 'choppy' | 'unclear';
  confidence: number;            // 0–1

  structureNotes: string;        // narrative tying HTF and LTF together
  liquidityNotes: string;        // comment on where liquidity sits across TFs
  fvgNotes: string;              // imbalances / FVGs that matter across TFs
  keyZones: string[];            // labels for key HTF/LTF zones
  patternNotes: string;          // any clear playbook-level patterns
  riskWarnings: string[];        // actionable warnings

  suggestedPlaybookTags: string[];

  // Multi-timeframe-specific fields:
  htfBias?: 'bullish' | 'bearish' | 'choppy' | 'unclear';
  ltfBias?: 'bullish' | 'bearish' | 'choppy' | 'unclear';
  alignmentScore?: number;       // 0–1, how well LTF aligns with HTF

  notesByTimeframe?: {
    timeframe: string;
    notes: string;
  }[];
}

Requirements:
- All non-optional fields must be present.
- confidence and alignmentScore (if provided) must be between 0 and 1.
- Do NOT output anything except plain JSON (no markdown, no prose).
`.trim();
}

function buildLiveWatchPrompt(payload) {
  const { plan, lastStatus } = payload;
  const {
    symbol,
    timeframe,
    direction,
    entryPrice,
    entryZoneLow,
    entryZoneHigh,
    stopLossPrice,
    takeProfitPrice,
  } = plan;

  return `
You are a precise execution assistant monitoring a live chart for a single trade idea.

The user has a trade PLAN:

interface LiveWatchPlan {
  direction: 'long' | 'short';
  entryPrice?: number;
  entryZoneLow?: number;
  entryZoneHigh?: number;
  stopLossPrice: number;
  takeProfitPrice?: number;
  symbol: string;
  timeframe: string;
}

Plan details:
- Symbol: ${symbol}
- Timeframe: ${timeframe}
- Direction: ${direction}
- Entry price (mid): ${entryPrice || '(n/a)'}
- Entry zone: [${entryZoneLow || '(n/a)'} .. ${entryZoneHigh || '(n/a)'}]
- Stop loss: ${stopLossPrice}
- Take profit: ${takeProfitPrice || '(n/a)'}

You are also told the last status of the trade idea:
${lastStatus || 'not_reached'}

You will see a live chart screenshot that shows current price relative to these levels.

Your job:
- Determine whether price has:
  - not reached the entry yet
  - just touched the entry zone
  - is actively in the trade (in_play)
  - invalidated the idea (e.g., blew through SL or structurally broken)
  - hit take profit
  - hit stop loss

You MUST respond ONLY with a single JSON object of this shape:

type LiveWatchStatus =
  | 'not_reached'
  | 'just_touched'
  | 'in_play'
  | 'invalidated'
  | 'tp_hit'
  | 'sl_hit';

interface LiveWatchAnalysis {
  status: LiveWatchStatus;
  comment: string;
  autopilotHint?: string;
}

Rules:
- "just_touched": price is just entering the zone / tag of entry.
- "in_play": trade would be active and not yet invalidated or at TP/SL.
- "invalidated": idea is no longer valid even if trade not in yet.
- "tp_hit": price clearly passed target area.
- "sl_hit": price clearly passed stop level.

comment: one or two sentences explaining the situation.
autopilotHint: short directive like:
- "Arm the trade now"
- "Do not enter, idea dead"
- "Move to break-even"
- "Take partials or trail"

Do NOT output anything except JSON. No markdown, no prose around it.
`.trim();
}

function buildJournalVisionPrompt(payload) {
  const { contextNote } = payload;

  return `
You are a trading performance analyst and journal coach.
You will see a screenshot of either:
- a broker history page
- a performance analytics dashboard
- a stats page with win rate / PnL curves / per-session results
- or something related.

Your job is to extract and interpret what you can see.

You MUST respond ONLY with a single JSON object in this shape:

interface JournalVisionAnalysis {
  source: 'broker_history' | 'performance_dashboard' | 'stats_page' | 'other';

  approxWinRate?: number;        // 0–1 if you can approximate from visible stats
  approxRR?: number;             // average R-multiple if visible
  approxDrawdown?: number;       // 0–1 fraction of peak if visible
  totalTradesText?: string;      // human-readable snippet like "121 trades last 30 days"
  bestDayText?: string;          // e.g. "Best day +$540 on 2025-11-20"
  worstDayText?: string;         // e.g. "Worst day -$400 on 2025-11-18"

  strengths: string[];           // 3–7 bullet points
  weaknesses: string[];          // 3–7 bullet points
  behaviorPatterns: string[];    // patterns you infer from graphs/metrics

  sessionInsights: string[];     // session-based notes if visible (London/NY/Asia)
  instrumentInsights: string[];  // symbol-based notes if visible

  coachingNotes: string;         // 2–4 sentences of coaching, in plain language.
}

Context note from the user (what they care about):
${contextNote || '(none provided)'}

Rules:
- If a numeric stat is NOT clearly visible, leave that field undefined.
- strengths/weaknesses/behaviorPatterns should be concrete and actionable.
- coachingNotes should sound like a coach talking directly to the trader.
- Do NOT output anything except plain JSON (no markdown, no prose before/after).
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

    // ------- Branch 2: Multi-Timeframe Chart Vision -------
    if (mode === 'mtf_vision_v1' && payload && Array.isArray(payload.frames)) {
      const mtfTask = 'chart_mtf';

      const prompt = buildMtfVisionPrompt(payload);

      // payload.frames: [{ imageBase64, timeframe, note? }]
      const imageArr = (payload.frames || [])
        .map(f => f.imageBase64)
        .filter(Boolean);

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

      const analysis =
        parsed && typeof parsed === 'object'
          ? parsed
          : {
              symbol: payload.symbol,
              timeframe:
                (payload.frames && payload.frames[0]?.timeframe) || 'unknown',
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

      const summary = `MTF VISION: Bias=${analysis.marketBias.toUpperCase()} (conf ${
        Math.round((analysis.confidence || 0) * 100)
      }%), HTF=${analysis.htfBias || 'n/a'}, LTF=${analysis.ltfBias || 'n/a'}, alignment=${
        typeof analysis.alignmentScore === 'number'
          ? Math.round(analysis.alignmentScore * 100) + '%'
          : 'n/a'
      }`;

      return res.json({
        provider,
        modelId: resolvedModelId,
        task: mtfTask,
        createdAt: new Date().toISOString(),
        rawText,
        summary,
        analysis,
      });
    }

    // ------- Branch 3: Live Watch status for a single plan -------
    if (mode === 'live_watch_v1' && payload && payload.plan && payload.imageBase64) {
      const liveTask = 'live_watch';

      const prompt = buildLiveWatchPrompt(payload);
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

      const analysis =
        parsed && typeof parsed === 'object'
          ? parsed
          : {
              status: 'not_reached',
              comment: rawText || 'Could not parse structured live-watch status.',
              autopilotHint: undefined,
            };

      return res.json({
        provider,
        modelId: resolvedModelId,
        task: liveTask,
        createdAt: new Date().toISOString(),
        rawText,
        plan: payload.plan,
        analysis,
      });
    }

    // ------- Branch 4: Journal / UI Vision -------
    if (mode === 'journal_vision_v1' && payload && payload.imageBase64) {
      const journalTask = 'journal';

      const prompt = buildJournalVisionPrompt(payload);
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

      const analysis =
        parsed && typeof parsed === 'object'
          ? parsed
          : {
              source: 'other',
              strengths: [],
              weaknesses: [],
              behaviorPatterns: [],
              sessionInsights: [],
              instrumentInsights: [],
              coachingNotes: rawText || '',
            };

      const summary = `Journal Vision: ${
        analysis.coachingNotes?.slice(0, 160) || 'No summary.'
      }${analysis.coachingNotes && analysis.coachingNotes.length > 160 ? '…' : ''}`;

      return res.json({
        provider,
        modelId: resolvedModelId,
        task: journalTask,
        createdAt: new Date().toISOString(),
        rawText,
        summary,
        analysis,
      });
    }

    // ------- Branch 5: Generic vision (fallback) -------
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

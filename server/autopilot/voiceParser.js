
// server/autopilot/voiceParser.js
const { callLLM } = require('../llmRouter');

/**
 * @param {{ transcript: string; sessionState: any }} input
 */
async function parseVoiceAutopilotCommand(input) {
  const { transcript, sessionState } = input || {};
  if (!transcript || typeof transcript !== 'string') {
    throw new Error('transcript is required.');
  }

  const instrument = sessionState?.instrument || {};
  const tf = sessionState?.timeframe || {};
  const env = sessionState?.environment || 'sim';
  const autopilotMode = sessionState?.autopilotMode || 'off';

  const instrumentLabel =
    instrument.displayName || instrument.symbol || 'Unknown instrument';

  const systemPrompt = `
You parse spoken trading commands into a structured Autopilot instruction.

You are working for Anthony, who trades indices like US30 and NAS100 intraday.

Given a voice transcript and some session context, output ONLY a JSON object
with these exact fields:

{
  "direction": "long" | "short" | "flat",
  "riskPercent": number,               // % of equity, default 0.25 if not spoken
  "executeMode": "plan_only" | "plan_and_suggest_execution",
  "notes": "short explanation of what the user asked for"
}

Rules:

- If the user clearly says "long", "buy", "call", treat as direction "long".
- If the user clearly says "short", "sell", "put", treat as direction "short".
- If the user just asks a question like "what should I do" without expressing a bias,
  use direction "flat".
- Parse numbers like "half a percent", "point five", "0 point 5" as 0.5 riskPercent.
- If no size is mentioned, use riskPercent = 0.25.
- If the user clearly says to actually place or execute a trade ("take it", "execute it",
  "go ahead and run it", "enter now"), set executeMode = "plan_and_suggest_execution".
  Otherwise, use "plan_only".
  (This does NOT actually execute trades; it only tells the frontend how urgent the intent is.)
- "notes" should be a 1-2 sentence human summary you would show in a panel.
  Do NOT mention that you are parsing JSON or that you are an AI.

Context:
Instrument: ${instrumentLabel}
Timeframe: ${tf.currentTimeframe || 'n/a'}
Environment: ${env.toUpperCase()}
Autopilot mode: ${autopilotMode.toUpperCase()}

Return ONLY the JSON. No backticks, no markdown.
  `.trim();

  const userPrompt = `Voice transcript: "${transcript}"`;

  const messages = [{ role: 'user', content: userPrompt }];

  let llmText;
  try {
    llmText = await callLLM({
      model: 'gpt-5.1', // Defaulting to robust model
      provider: 'openai',
      systemPrompt,
      messages,
      temperature: 0.2,
      maxTokens: 300,
    });
  } catch (err) {
    console.error('[VoiceParser] LLM error:', err);
    throw new Error('Voice parsing LLM call failed.');
  }

  let parsed;
  try {
    const clean = llmText.replace(/```json/g, "").replace(/```/g, "").trim();
    parsed = JSON.parse(clean);
  } catch (err) {
    console.error('[VoiceParser] JSON parse error. Raw:', llmText);
    throw new Error('Voice parsing JSON error.');
  }

  const direction =
    parsed.direction === 'short' || parsed.direction === 'flat'
      ? parsed.direction
      : 'long';
  const riskPercent =
    typeof parsed.riskPercent === 'number' && parsed.riskPercent > 0
      ? parsed.riskPercent
      : 0.25;
  const executeMode =
    parsed.executeMode === 'plan_and_suggest_execution'
      ? 'plan_and_suggest_execution'
      : 'plan_only';
  const notes = parsed.notes || '';

  return {
    direction,
    riskPercent,
    executeMode,
    notes,
  };
}

module.exports = {
  parseVoiceAutopilotCommand,
};

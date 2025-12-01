
import { TradingSessionState } from '../types';

export interface ParsedVoiceAutopilot {
  direction: 'long' | 'short' | 'flat';
  riskPercent: number;
  executeMode: 'plan_only' | 'plan_and_suggest_execution';
  notes: string;
}

export async function parseVoiceAutopilotCommandApi(args: {
  transcript: string;
  sessionState: TradingSessionState;
}): Promise<ParsedVoiceAutopilot> {
  const resp = await fetch('/api/autopilot/voice-parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transcript: args.transcript,
      sessionState: args.sessionState,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `Voice parse failed (${resp.status}): ${resp.statusText} - ${text}`
    );
  }

  return (await resp.json()) as ParsedVoiceAutopilot;
}


import { TradingSessionState } from '../types';
import { apiClient } from '../utils/apiClient';

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
  return apiClient.post<ParsedVoiceAutopilot>('/api/autopilot/voice-parse', {
    transcript: args.transcript,
    sessionState: args.sessionState,
  });
}

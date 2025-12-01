
import { GoogleGenAI } from '@google/genai';
import {
  AgentMessage,
  AgentTurnContext,
  AGENT_DEFINITIONS,
  AgentId,
  AgentJournalDraft
} from '../types/agents';

// Use standard flash model
const MODEL = 'gemini-2.5-flash';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

function formatHistory(history: AgentMessage[]): string {
  const recent = history.slice(-12);
  return recent
    .map((m) => {
      const who = m.role === 'user' ? 'User' : (m.agentName || 'Agent');
      return `[${who}] ${m.content}`;
    })
    .join('\n');
}

export async function runAgentRound(
  userMessage: string,
  history: AgentMessage[],
  context: AgentTurnContext,
  screenshot?: string | null
): Promise<AgentMessage[]> {
  const nowIso = new Date().toISOString();

  const historyText = formatHistory(history);

  const ctxLines = [
    context.symbol ? `Symbol: ${context.symbol}` : null,
    context.timeframe ? `Timeframe: ${context.timeframe}` : null,
    context.mode === 'post_trade'
      ? 'User is in POST-TRADE review mode. Focus heavily on lessons and journaling.'
      : 'User is LIVE in the market. Focus on decision-ready analysis.',
    context.journalSummary
      ? `Recent journal lessons: ${context.journalSummary}`
      : null,
    context.brokerSnapshot 
      ? `Broker state: ${JSON.stringify(context.brokerSnapshot)}`
      : null
  ].filter(Boolean).join('\n');

  const prompt = `
You are an AI trading team having an internal conversation.

Team:
${AGENT_DEFINITIONS.map((a) => `- ${a.name} [id=${a.id}]: ${a.description}`).join('\n')}

User message:
"${userMessage}"

Context:
${ctxLines || '(none provided)'}

Conversation so far:
${historyText || '(no prior conversation yet)'}

Goal:
1. Have your agents discuss the situation amongst themselves.
2. Each speaking agent should add **one message** in this round.
3. If appropriate, one of you (often Journal Coach) should propose a **Journal Draft**.
4. If a screenshot is provided, analyze the chart structure.

CRITICAL:
- Be concise but concrete. Max 4 sentences per agent.
- Reference each other by name when agreeing/disagreeing.
- Only include useful messages that advance the decision.

OUTPUT STRICTLY AS JSON WITH THIS SHAPE:
{
  "messages": [
    {
      "agentId": "quant_bot" | "trend_master" | "pattern_gpt" | "journal_coach",
      "agentName": "QuantBot",
      "content": "Message content",
      "journalDraft": {
        "title": "Headline",
        "summary": "Summary",
        "tags": ["Tag1"],
        "sentiment": "Bullish" | "Bearish" | "Neutral",
        "direction": "long" | "short" | null
      } | null
    }
  ]
}
`;

  try {
    const parts: any[] = [{ text: prompt }];

    if (screenshot) {
       // Check if it has data prefix
       const base64Data = screenshot.includes(',') 
          ? screenshot.split(',')[1] 
          : screenshot;
          
       parts.push({
          inlineData: {
             mimeType: 'image/jpeg',
             data: base64Data
          }
       });
    }

    const result = await ai.models.generateContent({
      model: MODEL,
      contents: {
        role: 'user',
        parts: parts
      },
      config: {
        responseMimeType: 'application/json'
      }
    });

    const text = result.text;
    if (!text) return [];

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
        // Fallback for markdown wrapping if model slips
        const clean = text.replace(/```json|```/g, '').trim();
        parsed = JSON.parse(clean);
    }

    const rawMessages: any[] = parsed?.messages || [];

    const agentMessages: AgentMessage[] = rawMessages.map((m, idx) => {
      // Map JSON ID back to typed AgentId
      // Ensure we match the defined IDs in AGENT_DEFINITIONS
      let agentId = (m.agentId || 'quant_bot') as AgentId;
      
      const journalDraft: AgentJournalDraft | undefined =
      m.journalDraft && m.journalDraft.title
        ? {
            title: m.journalDraft.title,
            summary: m.journalDraft.summary || '',
            tags: m.journalDraft.tags || [],
            sentiment: m.journalDraft.sentiment || 'Neutral',
            agentId,
            agentName: m.agentName || 'Unknown Agent',
            direction: m.journalDraft.direction || undefined
          }
        : undefined;

      return {
        id: `agent-${nowIso}-${idx}-${agentId}`,
        role: 'agent',
        agentId,
        agentName: m.agentName,
        content: m.content,
        createdAt: nowIso,
        journalDraft
      };
    });

    return agentMessages;

  } catch (error) {
    console.error("Agent round failed", error);
    return [];
  }
}

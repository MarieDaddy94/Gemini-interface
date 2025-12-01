
import { PlaybookReviewPayload } from '../types';

export function buildPlaybookReviewPrompt(payload: PlaybookReviewPayload): string {
  const { entries } = payload;

  return `
You are an elite trading coach and risk manager.

I am sharing my recent journal entries as structured data.
Each entry has:
- id
- playbook (setup / plan)
- note (journal notes)
- outcome (Win/Loss/BreakEven/Open)
- symbol
- direction (long/short, when provided)

Here are the entries (JSON):
${JSON.stringify(entries, null, 2)}

Task:
1. Extract the **core lessons** from these entries.
2. Group them into:
   - "What I'm doing well"
   - "Mistakes / leaks"
   - "Concrete rules I should add to my playbook"
3. Be **short and punchy**, bullet-point style.
4. Do NOT talk about emotions or psychology — only **rules, execution, and edge**.
5. Aim for something I can re-read quickly before each session.
`;
}


export type ToolProvider = "openai" | "gemini";

export type ToolStatus = "pending" | "ok" | "error";

export interface ToolActivityEvent {
  id: string;
  ts: number;
  provider: ToolProvider;
  name: string;
  status: ToolStatus;
  args?: any;
  argsSummary?: string;
  errorMessage?: string;
}

type Listener = (evt: ToolActivityEvent) => void;

const listeners = new Set<Listener>();

function makeArgsSummary(args: any): string | undefined {
  if (!args) return undefined;
  try {
    const s = JSON.stringify(args);
    if (s.length > 160) return s.slice(0, 157) + "...";
    return s;
  } catch {
    return undefined;
  }
}

/**
 * Record a tool activity event and fan it out to all listeners.
 */
export function recordToolActivity(params: {
  provider: ToolProvider;
  name: string;
  status: ToolStatus;
  args?: any;
  errorMessage?: string;
}) {
  const evt: ToolActivityEvent = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    ts: Date.now(),
    provider: params.provider,
    name: params.name,
    status: params.status,
    args: params.args,
    argsSummary: makeArgsSummary(params.args),
    errorMessage: params.errorMessage,
  };

  listeners.forEach((fn) => fn(evt));
}

/**
 * Subscribe to tool activity events. Returns an unsubscribe function.
 */
export function subscribeToolActivity(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

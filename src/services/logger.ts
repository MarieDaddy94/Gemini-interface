
const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000';

type LogLevel = 'INFO' | 'WARN' | 'ERROR';

class Logger {
  private async sendLog(level: LogLevel, message: string, meta?: any) {
    try {
      await fetch(`${API_BASE_URL}/api/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, message, meta }),
      });
    } catch (e) {
      // Fallback to console if backend logging fails, to avoid infinite loops
      console.error('Failed to send log to backend:', e);
    }
  }

  info(message: string, meta?: any) {
    console.log(`[INFO] ${message}`, meta);
    this.sendLog('INFO', message, meta);
  }

  warn(message: string, meta?: any) {
    console.warn(`[WARN] ${message}`, meta);
    this.sendLog('WARN', message, meta);
  }

  error(message: string, meta?: any) {
    console.error(`[ERROR] ${message}`, meta);
    // Extract stack if it's an Error object
    const metaToSend = meta instanceof Error ? { message: meta.message, stack: meta.stack } : meta;
    this.sendLog('ERROR', message, metaToSend);
  }
}

export const logger = new Logger();

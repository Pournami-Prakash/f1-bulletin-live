type LogValue = string | number | boolean | null;

// Accept named scalar fields only. Never log request URLs, tokens, DB error
// messages, news content, or arbitrary exception objects.
export function logEvent(level: 'info' | 'warn' | 'error', event: string, fields: Record<string, LogValue> = {}) {
  console[level](JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...fields }));
}

export function safeExternalUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048) return '#';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '#';
  } catch { return '#'; }
}

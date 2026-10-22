export function validateApiRequest(url: URL): string | null {
  if (url.href.length > 4096) return 'Request URL is too long';
  const ranges: Record<string, [number, number]> = {
    days: [1, 365], hours: [1, 720], limit: [1, 500], round: [1, 40], season: [1950, 2100],
  };
  for (const [name, value] of url.searchParams) {
    if (url.searchParams.getAll(name).length !== 1) return `Duplicate ${name} parameter`;
    if (value.length > (name === 'names' ? 2400 : 256)) return `${name} is too long`;
    if (ranges[name] && !(name === 'season' && value === 'current')) {
      const [min, max] = ranges[name];
      if (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max) return `Invalid ${name}`;
    }
    if (['latest', 'history', 'html'].includes(name) && !['0', '1'].includes(value)) return `Invalid ${name}`;
  }
  const id = url.pathname.match(/\/api\/racing\/(?:race|replay)\/([^/]+)$/)?.[1];
  if (id && (!/^\d{1,10}$/.test(id) || Number(id) < 1 || Number(id) > 2147483647)) return 'Invalid session ID';
  return null;
}

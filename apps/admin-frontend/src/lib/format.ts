/** Analytics buckets come back as `YYYY-MM-DD` or `YYYY-MM-DD HH:MM:SS` (UTC). */
export function bucketToMs(bucket: string): number {
  const iso = bucket.replace(' ', 'T') + (bucket.includes('Z') || bucket.length <= 10 ? '' : 'Z');
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? Date.now() : ms;
}

/** Cap a URL to a readable length for table cells; full value stays in `title`. */
export function truncateUrl(url: string, max = 56): string {
  return url.length > max ? `${url.slice(0, max - 1)}…` : url;
}

export function formatDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString();
}

/** <input type="datetime-local"> wants a local ISO string with no zone. */
export function toLocalInput(epochMs: number): string {
  const d = new Date(epochMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

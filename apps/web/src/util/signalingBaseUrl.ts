/**
 * HTTP base for signaling (`/token`, etc.).
 *
 * Resolution order:
 *  1. `VITE_SIGNALING_URL` env var (set at build time)
 *  2. Auto-detect: localhost → `http://localhost:8787`, otherwise → same-origin `/api`
 *
 * Strips trailing `/health` so pasting a health-check URL still works.
 */
export function getSignalingHttpBase(): string {
  let s = (import.meta.env.VITE_SIGNALING_URL ?? '').trim();
  s = s.replace(/\/+$/, '');
  if (s.endsWith('/health')) {
    s = s.slice(0, -'/health'.length).replace(/\/+$/, '');
  }
  if (!s) {
    const h = window.location.hostname;
    s =
      h === 'localhost' || h === '127.0.0.1'
        ? 'http://localhost:8787'
        : `${window.location.origin}/api`;
  } else if (s.startsWith('/')) {
    s = `${window.location.origin}${s}`;
  }
  return s || 'http://localhost:8787';
}

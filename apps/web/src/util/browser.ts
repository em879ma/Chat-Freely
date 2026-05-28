/** Desktop or mobile Safari (excludes Chrome/Firefox/Edge on iOS). */
export function isAppleSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  if (!ua.includes('safari')) return false;
  if (ua.includes('chrome') || ua.includes('chromium') || ua.includes('edg')) return false;
  return true;
}

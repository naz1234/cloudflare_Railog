// This capability opens only one temporary scanner, never the application.
export const REMOVAL_SCAN_ID = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
export const REMOVAL_SCAN_TOKEN = /^[a-f0-9]{64}$/;

const scannerFiles = new Set([
  '/removal-scan',
  '/removal-scan.html',
  '/removal-scan-assets/removal-scan.js',
  '/removal-scan-assets/removal-scan.css',
]);

export function isRemovalScanPublicRequest(request) {
  const url = new URL(request.url);
  if (['GET', 'HEAD'].includes(request.method) && scannerFiles.has(url.pathname)) return true;
  return url.pathname === '/api/removal-scan'
    && ['GET', 'POST', 'PATCH'].includes(request.method)
    && REMOVAL_SCAN_ID.test(url.searchParams.get('id') || '')
    && REMOVAL_SCAN_TOKEN.test(request.headers.get('X-Removal-Scan-Token') || '');
}

export function withRemovalScanSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  headers.set('Permissions-Policy', 'camera=(self), geolocation=(), microphone=()');
  headers.set('Content-Security-Policy', [
    "default-src 'none'", "base-uri 'none'", "connect-src 'self'",
    "script-src 'self'", "style-src 'self'", "img-src 'self' data: blob:",
    "form-action 'self'", "frame-ancestors 'none'",
  ].join('; '));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

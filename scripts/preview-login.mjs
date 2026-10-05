#!/usr/bin/env node
// Local design review only. No production services, credentials, email, or cookies.
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

const DEMO_EMAIL = 'nazif.jaffar@flow-metro.com';
const DEMO_PIN = '284169';
const DEMO_TOKEN = 'local-preview-verification-only';
const EXPIRY_SECONDS = 300;
const RESEND_SECONDS = 60;
const MAX_ATTEMPTS = 5;
const EMAIL_PATTERN = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const assets = new Map([
  ['/auth/login.js', ['../public/auth/login.js', 'text/javascript; charset=utf-8']],
  ['/auth/login.css', ['../public/auth/login.css', 'text/css; charset=utf-8']],
  ['/favicon.png', ['../public/favicon.png', 'image/png']],
]);

const previewStyle = `
.local-preview-banner { position: relative; z-index: 100; display: flex; flex-wrap: wrap;
  align-items: center; justify-content: center; gap: 4px 10px; padding: 9px 14px;
  color: #ffe6a8; background: #252119; border-bottom: 1px solid #715d32;
  font: 12px/1.5 system-ui, sans-serif; text-align: center; }
.local-preview-banner strong { color: #fff1c9; letter-spacing: .08em; }
.local-preview-banner code { color: #fff1c9; font: 700 13px ui-monospace, monospace; }
.local-preview-result { box-sizing: border-box; min-height: 100svh; margin: 0; padding: 24px;
  display: grid; place-content: center; color: #edf3fa; background: #081725;
  font: 16px/1.6 system-ui, sans-serif; }
.local-preview-result main { max-width: 560px; }
.local-preview-result h1 { font-size: clamp(26px, 7vw, 40px); line-height: 1.2; }
.local-preview-result a { color: #83d8ff; }
`;

const previewBanner = `<aside class="local-preview-banner" aria-label="Local preview notice">
  <strong>LOCAL PREVIEW</strong><span>· No email is sent · Test PIN: <code>${DEMO_PIN}</code></span>
</aside>`;

const turnstileStub = `(() => {
  'use strict';
  const callbacks = new Map();
  let nextId = 0;
  const ready = (id) => window.setTimeout(() => callbacks.get(id)?.('${DEMO_TOKEN}'), 120);
  window.turnstile = {
    render(_selector, options) {
      const id = 'local-preview-' + nextId++;
      callbacks.set(id, options.callback);
      ready(id);
      return id;
    },
    reset(id) { ready(id); },
    remove(id) { callbacks.delete(id); },
  };
})();`;

const successHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Local login test complete</title>
<style>${previewStyle}</style></head><body class="local-preview-result"><main>
<p>LOCAL PREVIEW ONLY</p><h1>Local login test complete</h1>
<p>The preview flow is complete. No email was sent, no production session was created, and no live application is accessible here.</p>
<p><a href="/login">Test the login again</a></p>
</main></body></html>`;

function send(response, status, body, contentType = 'application/json; charset=utf-8', headers = {}) {
  response.writeHead(status, { 'Content-Type': contentType, ...headers });
  response.end(typeof body === 'object' && !Buffer.isBuffer(body) ? JSON.stringify(body) : body);
}

function error(response, status, code, message, extra = {}, headers = {}) {
  send(response, status, { ok: false, ...extra, error: { code, message } }, undefined, headers);
}

function maskEmail(email) {
  const [local, domain] = email.split('@');
  return `${local.slice(0, Math.min(4, Math.max(1, local.length - 1)))}***@${domain}`;
}

async function readJson(request) {
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') return null;
  let body = '';
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size <= 4096) body += chunk.toString('utf8');
  }
  if (size > 4096) return null;
  try {
    const value = JSON.parse(body);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

export function createLoginPreviewServer({ now = Date.now } = {}) {
  const challenges = new Map();
  const cooldowns = new Map();
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
    const port = server.address()?.port;
    const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
    if (!allowedHosts.has(request.headers.host)) {
      return error(response, 403, 'INVALID_HOST', 'This preview is available only on localhost.');
    }
    const origin = `http://${request.headers.host}`;
    let url;
    try { url = new URL(request.url, origin); }
    catch { return error(response, 400, 'INVALID_REQUEST', 'Invalid request URL.'); }
    if (url.origin !== origin) return error(response, 403, 'INVALID_ORIGIN', 'Request origin is not allowed.');
    const apiMethods = new Map([
      ['/api/auth/config', 'GET'], ['/api/auth/session', 'GET'],
      ['/api/auth/request-code', 'POST'], ['/api/auth/verify-code', 'POST'],
    ]);
    const method = apiMethods.get(url.pathname) || 'GET';
    if (request.method !== method) {
      return error(response, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed.', {}, { Allow: method });
    }
    if (method === 'POST' && request.headers.origin !== origin) {
      return error(response, 403, 'INVALID_ORIGIN', 'Request origin is not allowed.');
    }

    try {
      if (url.pathname === '/login' || url.pathname === '/login.html') {
        const source = await readFile(new URL('../public/login.html', import.meta.url), 'utf8');
        const html = source
          .replace(/https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit/g, '/__preview/turnstile.js')
          .replace('</head>', `<style>${previewStyle}</style></head>`)
          .replace(/<body([^>]*)>/i, `<body$1>${previewBanner}`);
        return send(response, 200, html, 'text/html; charset=utf-8');
      }
      if (url.pathname === '/') return send(response, 200, successHtml, 'text/html; charset=utf-8');
      if (url.pathname === '/__preview/turnstile.js') return send(response, 200, turnstileStub, 'text/javascript; charset=utf-8');
      if (assets.has(url.pathname)) {
        const [relativePath, contentType] = assets.get(url.pathname);
        return send(response, 200, await readFile(new URL(relativePath, import.meta.url)), contentType);
      }
      if (url.pathname === '/api/auth/config') return send(response, 200, { siteKey: 'local-preview-only' });
      if (url.pathname === '/api/auth/session') {
        // Deliberately no session or cookies: every /login visit remains testable.
        return error(response, 401, 'UNAUTHENTICATED', 'Authentication required.', { authenticated: false });
      }

      const time = now();
      for (const [id, challenge] of challenges) if (challenge.expiresAt <= time) challenges.delete(id);
      for (const [email, deadline] of cooldowns) if (deadline <= time) cooldowns.delete(email);

      if (url.pathname === '/api/auth/request-code') {
        const body = await readJson(request);
        const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
        if (!body || !EMAIL_PATTERN.test(email) || Object.keys(body).some((key) => !['email', 'turnstileToken'].includes(key))) {
          return error(response, 400, 'INVALID_REQUEST', 'Enter a valid approved email address.');
        }
        if (body.turnstileToken !== DEMO_TOKEN) {
          return error(response, 400, 'VERIFICATION_REQUIRED', 'Please complete the security check and try again.');
        }
        if (cooldowns.has(email)) {
          const retryAfterSeconds = Math.ceil((cooldowns.get(email) - time) / 1000);
          return error(response, 429, 'TOO_MANY_REQUESTS', 'Please wait before requesting another code.', { retryAfterSeconds }, { 'Retry-After': String(retryAfterSeconds) });
        }
        const challengeId = randomBytes(24).toString('base64url');
        const requestRef = randomBytes(3).toString('hex').toUpperCase();
        challenges.set(challengeId, { email, expiresAt: time + EXPIRY_SECONDS * 1000, attempts: 0 });
        cooldowns.set(email, time + RESEND_SECONDS * 1000);
        return send(response, 202, {
          ok: true, message: 'If this email is approved, a login code was sent.',
          expiresInSeconds: EXPIRY_SECONDS, resendAfterSeconds: RESEND_SECONDS,
          challengeId, emailHint: maskEmail(email), requestRef,
        });
      }
      if (url.pathname === '/api/auth/verify-code') {
        const body = await readJson(request);
        const code = typeof body?.code === 'string' ? body.code.trim() : '';
        const challengeId = typeof body?.challengeId === 'string' ? body.challengeId.trim() : '';
        if (!/^\d{6}$/.test(code) || !/^[A-Za-z0-9_-]{24,128}$/.test(challengeId)) {
          return error(response, 400, 'INVALID_REQUEST', 'Enter a valid 6-digit code.');
        }
        const challenge = challenges.get(challengeId);
        if (!challenge || challenge.attempts >= MAX_ATTEMPTS || challenge.email !== DEMO_EMAIL) {
          return error(response, 401, 'INVALID_CODE', 'The code is invalid or expired.');
        }
        if (code !== DEMO_PIN) {
          challenge.attempts += 1;
          return error(response, 401, 'INVALID_CODE', 'The code is invalid or expired.');
        }
        challenges.delete(challengeId);
        return send(response, 200, {
          ok: true, authenticated: true,
          user: { email: maskEmail(DEMO_EMAIL), name: 'Nazif Jaffar' },
          expiresAt: new Date(time + 10 * 60 * 60 * 1000).toISOString(),
        });
      }
      return error(response, 404, 'NOT_FOUND', 'Not found.');
    } catch {
      if (!response.headersSent) error(response, 500, 'PREVIEW_ERROR', 'The local preview could not handle this request.');
      else response.end();
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  return server;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  const port = args.length === 0 ? 4190 : args.length === 2 && args[0] === '--port' ? Number(args[1]) : NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('Usage: node scripts/preview-login.mjs [--port 4190]');
    process.exitCode = 1;
  } else {
    const server = createLoginPreviewServer();
    server.on('error', (failure) => {
      console.error(`Local preview could not start: ${failure.code || 'unknown error'}`);
      process.exitCode = 1;
    });
    server.listen(port, '127.0.0.1', () => {
      console.log(`Local login preview: http://127.0.0.1:${port}/login`);
      console.log(`Demo email: ${DEMO_EMAIL} | Test PIN: ${DEMO_PIN}`);
      console.log('Local only: no email, production connections, or session cookies. Ctrl+C to stop.');
    });
  }
}

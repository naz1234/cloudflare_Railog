import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('custom login uses the L3 DC Template identity and requests an individual Flow email', async () => {
  const html = await readSource('public/login.html');

  assert.match(html, /<h1 id="auth-title">L3 DC<br \\/>TEMPLATE<\\/h1>/);
  assert.doesNotMatch(html, /NORTH YARD/i);
  assert.match(html, /type=["']email["']/i);
  assert.match(html, /name=["']email["']/i);
  assert.match(html, /@flow-metro\.com/);
  assert.doesNotMatch(html, /l3\.d\*\*\*@flow-metro\.com/i);
  assert.match(html, /id=["']request-reference["']/);
  assert.equal((html.match(/aria-label=["']Verification code digit \d["']/g) || []).length, 6);
});

test('login requires a fresh Turnstile token and tab-local challenge for verification', async () => {
  const [html, script] = await Promise.all([
    readSource('public/login.html'),
    readSource('public/auth/login.js'),
  ]);

  assert.match(html, /challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit/);
  assert.match(script, /action:\s*['"]l3dc-login['"]/);
  assert.match(script, /JSON\.stringify\(\{ email, turnstileToken: requestTurnstileToken \}\)/);
  assert.match(script, /turnstileToken:\s*requestTurnstileToken/);
  assert.match(script, /window\.turnstile\.reset/);
  assert.match(script, /sessionStorage\.setItem\(CHALLENGE_STORAGE_KEY/);
  assert.doesNotMatch(script, /localStorage/);
  assert.match(script, /challengeId:\s*activeChallengeId,\s*code/);
  assert.match(script, /new URL\(candidate, window\.location\.origin\)/);
  assert.match(script, /resolved\.origin !== window\.location\.origin/);
  assert.match(script, /response\.status === 429/);
  assert.match(script, /headers\.get\(['"]retry-after['"]\)/);
  assert.match(script, /data\.retryAfterSeconds \?\? data\.error\?\.retryAfterSeconds/);
  assert.match(script, /Please wait before requesting another code\./);

  const rateLimitBlock = script.slice(
    script.indexOf('if (response.status === 429)'),
    script.indexOf("if (!response.ok) throw new Error('request_failed')"),
  );
  assert.doesNotMatch(rateLimitBlock, /clearChallenge\(/);

  const widgetPosition = html.indexOf('id="turnstile-shell"');
  const requestStagePosition = html.indexOf('id="request-stage"');
  const verifyStagePosition = html.indexOf('id="verify-stage"');
  assert.ok(widgetPosition > 0 && widgetPosition < requestStagePosition && widgetPosition < verifyStagePosition);
});

test('main application verifies the server session and redirects through the isolated login shell', async () => {
  const [authContext, protectedRoute, depotStabling, app] = await Promise.all([
    readSource('src/lib/AuthContext.jsx'),
    readSource('src/components/ProtectedRoute.jsx'),
    readSource('src/pages/DepotStabling.jsx'),
    readSource('src/App.jsx'),
  ]);

  assert.match(authContext, /['"]\/api\/auth\/session['"]/);
  assert.match(authContext, /credentials:\s*['"]same-origin['"]/);
  assert.match(authContext, /BroadcastChannel/);
  assert.match(authContext, /window\.addEventListener\(['"]focus['"]/);
  assert.match(authContext, /window\.setTimeout\(\(\) =>/);
  assert.match(authContext, /Date\.parse\(user\?\.expiresAt/);
  assert.match(authContext, /queryClientInstance\.clear\(\)/);
  assert.doesNotMatch(authContext, /localStorage/);
  assert.match(authContext, /data\.logoutUrl === ['"]\/cdn-cgi\/access\/logout['"]/);
  assert.match(authContext, /data\.user\?\.name/);
  assert.match(authContext, /window\.location\.replace\(['"]\/cdn-cgi\/access\/logout['"]\)/);
  assert.match(authContext, /`\/login\?returnTo=\$\{encodeURIComponent\(returnTo\)\}`/);
  assert.match(protectedRoute, /\/login\?returnTo=/);
  assert.match(protectedRoute, /await logout\(\)/);
  assert.match(protectedRoute, /['"]\/api\/auth\/presence['"]/);
  assert.match(protectedRoute, /Online now/);
  assert.match(protectedRoute, /You're online/);
  assert.match(protectedRoute, /aria-expanded=\{isOpen\}/);
  assert.doesNotMatch(protectedRoute, /fixed bottom-4 right-4/);
  assert.match(protectedRoute, /Sign out of L3 DC Template/);
  assert.match(depotStabling, /import \{ SessionPresenceControl \} from ["']\.\.\/components\/ProtectedRoute["']/);
  assert.match(depotStabling, /<SessionPresenceControl\s*\/>/);
  assert.match(app, /<ProtectedRoute\s*\/>/);
});

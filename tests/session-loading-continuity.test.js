import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const require = createRequire(import.meta.url);
const componentSource = read('src/components/SecureSessionLoading.jsx');
const routeSource = read('src/components/ProtectedRoute.jsx');
const index = read('index.html');
const login = read('public/login.html');
const css = read('public/auth/session-loading.css');

function load(source, overrides = {}) {
  const output = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    fileName: 'SessionLoading.jsx',
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(
    (name) => Object.hasOwn(overrides, name) ? overrides[name] : require(name), module, module.exports,
  );
  return module.exports.default;
}
const Loading = load(componentSource);
const rendered = renderToStaticMarkup(React.createElement(Loading));

test('login, pre-JavaScript HTML and React auth fallback share the same loading identity and stylesheet', () => {
  for (const html of [index, login]) {
    assert.match(html, /<link rel="stylesheet" href="\/auth\/session-loading\.css"\s*\/>/);
    assert.match(html, /<main class="[^"]*session-loading-screen[^"]*"/);
  }
  for (const html of [index, login, rendered]) {
    for (const className of ['brand-lockup', 'brand-mark', 'session-check-panel', 'session-check-spinner', 'shell-footer']) {
      assert.ok(html.includes(`class="${className}"`), className);
    }
    assert.match(html, />L3 DC TEMPLATE<\/h1>/);
    assert.match(html, />DEPOT CONTROL<\/p>/);
    assert.match(html, />Checking your session…<\/h2>/);
    assert.match(html, />Opening your workspace securely\.<\/p>/);
    assert.match(html, /role="status" aria-live="polite" aria-busy="true"/);
    assert.match(html, /viewBox="0 0 32 32"/);
  }
  assert.doesNotMatch(componentSource, /fetch\(|localStorage|sessionStorage|setTimeout|setInterval/);
  assert.match(routeSource, /const DefaultFallback = SecureSessionLoading;/);
});

test('initial application HTML contains the loading screen before the JavaScript entry loads', () => {
  const root = index.slice(index.indexOf('<div id="root">'), index.indexOf('<script type="module"'));
  assert.match(root, /session-loading-screen/);
  assert.match(root, /Checking your session…/);
  assert.doesNotMatch(root, /<form|<input|stabling|Copy Stabling/);
  assert.ok(index.indexOf('/auth/session-loading.css') < index.indexOf('<div id="root">'));
});

test('shared loading styles are scoped, theme-independent, responsive and respect reduced motion', () => {
  assert.doesNotMatch(css, /:root|^body\b|^html\b|--muted|--blue/gm);
  assert.match(css, /\.session-loading-screen \{[\s\S]*?position: fixed;[\s\S]*?inset: 0;/);
  assert.match(css, /color-scheme: dark;/);
  assert.match(css, /\.session-loading-screen \.session-check-panel h2 \{[^}]*color: #f1f3fa !important;/);
  assert.match(css, /\.session-loading-screen \.brand-mark \* \{ color: #b2cfff !important;/);
  assert.match(css, /height: min\(650px, 78%\)/, 'the decorative glow must not create a loading-screen scrollbar');
  assert.match(css, /\.session-loading-screen \[hidden\] \{ display: none !important; \}/);
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(css, /@media \(max-width: 380px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.session-loading-screen \.session-check-spinner \{ animation: none; \}/);
});

function renderGuard(auth) {
  const Route = load(routeSource, {
    react: { ...React, useEffect() {} },
    '@/lib/AuthContext': { useAuth: () => auth },
    '@/components/SecureSessionLoading': { default: Loading },
    '@/components/ActionTooltip': { default: () => null },
    'lucide-react': { LogOut: () => null },
    'react-router-dom': { Outlet: () => React.createElement('section', null, 'PRIVATE REQ WORKSPACE') },
  });
  return renderToStaticMarkup(React.createElement(Route));
}

test('the shared loading screen still blocks the REQ workspace until server authentication is confirmed', () => {
  for (const auth of [
    { isLoadingAuth: true, authChecked: false, isAuthenticated: false },
    { isLoadingAuth: false, authChecked: false, isAuthenticated: true },
    { isLoadingAuth: true, authChecked: true, isAuthenticated: true },
    { isLoadingAuth: false, authChecked: true, isAuthenticated: false },
  ]) {
    const html = renderGuard(auth);
    assert.match(html, /session-loading-screen/);
    assert.doesNotMatch(html, /PRIVATE REQ WORKSPACE/);
  }
  assert.equal(renderGuard({ isLoadingAuth: false, authChecked: true, isAuthenticated: true }), '<section>PRIVATE REQ WORKSPACE</section>');
});

test('authentication errors still provide retry instead of opening the workspace', () => {
  const html = renderGuard({
    isLoadingAuth: false, authChecked: true, isAuthenticated: false,
    authError: { message: 'Check your connection.' }, checkUserAuth() {},
  });
  assert.match(html, /Login service unavailable/);
  assert.match(html, /Retry secure login/);
  assert.doesNotMatch(html, /PRIVATE REQ WORKSPACE/);
});

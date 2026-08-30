import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const protectedRoute = readFileSync(
  new URL('../src/components/ProtectedRoute.jsx', import.meta.url),
  'utf8',
);
const stylesheet = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

test('online presence avatars expose scoped light-theme hooks', () => {
  assert.match(protectedRoute, /theme-session-presence/);
  assert.match(protectedRoute, /theme-presence-avatar relative/);
  assert.match(protectedRoute, /theme-presence-avatar-dot absolute/);
  assert.match(protectedRoute, /bg-\[#0a2a42\]/);
  assert.match(protectedRoute, /text-cyan-100/);
});

test('light mode keeps initials readable on the dark avatar circles', () => {
  const avatarRule = stylesheet.match(
    /html\[data-app-theme="light"\] \.theme-session-presence \.theme-presence-avatar \{([^}]+)\}/,
  )?.[1];

  assert.ok(avatarRule, 'expected a scoped light-mode avatar rule');
  assert.match(avatarRule, /background-color: #0a2a42 !important/);
  assert.match(avatarRule, /color: #ecfeff !important/);
  assert.match(avatarRule, /-webkit-text-fill-color: #ecfeff !important/);
  assert.doesNotMatch(avatarRule, /color: #000000/);
});

test('light-mode hover and online dot remain visible without affecting dark mode', () => {
  assert.match(
    stylesheet,
    /html\[data-app-theme="light"\] \.theme-session-presence \.theme-presence-avatar:hover \{[\s\S]*?background-color: #103b5c !important;[\s\S]*?color: #ffffff !important;/,
  );
  assert.match(
    stylesheet,
    /html\[data-app-theme="light"\] \.theme-session-presence \.theme-presence-avatar-dot \{\s*border-color: #ffffff !important;/,
  );
  assert.doesNotMatch(stylesheet, /^\.theme-session-presence \.theme-presence-avatar\s*\{/m);
});

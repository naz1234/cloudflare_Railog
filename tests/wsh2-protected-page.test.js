import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as icons from 'lucide-react';
import ts from 'typescript';

const source = readFileSync(new URL('../src/pages/DepotStabling.jsx', import.meta.url), 'utf8');
const gateSource = readFileSync(new URL('../src/components/Wsh2ProtectedPage.jsx', import.meta.url), 'utf8');
const gateModule = { exports: {} };
const compiled = ts.transpileModule(gateSource, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const localRequire = createRequire(import.meta.url);
new Function('require', 'module', 'exports', compiled)((name) => name === 'lucide-react' ? icons : localRequire(name), gateModule, gateModule.exports);
const Gate = gateModule.exports.default;

test('WSH2 is grouped after ODO with the same hidden shortcuts and relock handling', () => {
  const keys = source.match(/const PROTECTED_SHORTCUT_KEYS = new Set\(\[([^\]]+)\]\)/)[1];
  assert.match(keys, /"wsh2"/);
  const entries = source.slice(source.indexOf('key: "odo",'), source.indexOf('key: "alarm",'));
  assert.match(entries, /key: "wsh2", label: "Wash Checklist", code: "WSH2", to: "\/wsh2"/);
  assert.match(source, /\.filter\(\(\{ key \}\) => !PROTECTED_SHORTCUT_KEYS\.has\(key\) \|\| areProtectedShortcutsUnlocked\)/);
  assert.match(source, /if \(PROTECTED_SHORTCUT_KEYS\.has\(activeTab\)\) \{\s*setActiveTab\("stabling"\)/);
  assert.match(source, /<Wsh2ProtectedPage unlocked=\{areProtectedShortcutsUnlocked\} onUnlock=\{handleProtectedShortcutToggle\}>\s*<Wsh2Workspace \/>/);
});

test('WSH2 direct access does not mount checklist controls or polling until unlocked', () => {
  let mounts = 0;
  function Checklist() { mounts++; return React.createElement('div', null, 'Actual checklist'); }
  const child = React.createElement(Checklist);
  const locked = renderToStaticMarkup(React.createElement(Gate, null, child));
  assert.match(locked, /Protected page · WSH2/);
  assert.match(locked, /Unlock protected pages/);
  assert.doesNotMatch(locked, /Actual checklist/);
  assert.equal(mounts, 0);
  assert.match(renderToStaticMarkup(React.createElement(Gate, { unlocked: true }, child)), /Actual checklist/);
  assert.equal(mounts, 1);
  renderToStaticMarkup(React.createElement(Gate, { unlocked: false }, child));
  assert.equal(mounts, 1);
  let unlockRequested = false;
  const gate = Gate({ onUnlock: () => { unlockRequested = true; } });
  React.Children.toArray(gate.props.children).find((element) => element.type === 'button').props.onClick();
  assert.equal(unlockRequested, true);
  assert.doesNotMatch(gateSource, /sessionStorage|LOGIN_PASSWORD|fetch\(/);
});

test('mobile navigation hides WSH2 until the shared protected-page session is unlocked', () => {
  const mobile = readFileSync(new URL('../src/components/ReqMobileNavigation.jsx', import.meta.url), 'utf8');
  assert.match(source, /protectedPagesUnlocked=\{areProtectedShortcutsUnlocked\}/);
  assert.match(mobile, /protectedPagesUnlocked = false/);
  const expression = mobile.match(/pages\.filter\(\(\[path\]\) => ([^)]+)\)/)[1];
  const visible = new Function('path', 'protectedPagesUnlocked', `return ${expression}`);
  assert.equal(visible('wsh2', false), false);
  assert.equal(visible('wsh2', true), true);
  assert.equal(visible('train-washing', false), true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as icons from 'lucide-react';
import ts from 'typescript';

const source = readFileSync(new URL('../src/pages/DepotStabling.jsx', import.meta.url), 'utf8');
const gateSource = readFileSync(new URL('../src/components/WashingProtectedPage.jsx', import.meta.url), 'utf8');
const gateModule = { exports: {} };
const compiled = ts.transpileModule(gateSource, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const localRequire = createRequire(import.meta.url);
new Function('require', 'module', 'exports', compiled)((name) => name === 'lucide-react' ? icons : localRequire(name), gateModule, gateModule.exports);
const Gate = gateModule.exports.default;

test('WSH replaces WSH2 in the protected group after ODO with shared relock handling', () => {
  const keys = source.match(/const PROTECTED_SHORTCUT_KEYS = new Set\(\[([^\]]+)\]\)/)[1];
  assert.match(keys, /"washing"/);
  assert.doesNotMatch(keys, /"wsh2"/);
  const entries = source.slice(source.indexOf('key: "odo",'), source.indexOf('key: "alarm",'));
  assert.match(entries, /key: "washing", label: "Train Washing", code: "WSH", to: "\/train-washing"/);
  assert.match(source, /\.filter\(\(\{ key \}\) => !PROTECTED_SHORTCUT_KEYS\.has\(key\) \|\| areProtectedShortcutsUnlocked\)/);
  assert.match(source, /if \(PROTECTED_SHORTCUT_KEYS\.has\(activeTab\)\) \{\s*setActiveTab\("stabling"\)/);
  assert.match(source, /activeTab === "washing"[\s\S]*?<WashingProtectedPage unlocked=\{areProtectedShortcutsUnlocked\} onUnlock=\{handleProtectedShortcutToggle\}>[\s\S]*?<TrainWashing \/>[\s\S]*?<TrainWashingDocxExport \/>[\s\S]*?<\/WashingProtectedPage>/);
});

test('WSH direct access does not mount washing controls or reports until unlocked', () => {
  let mounts = 0;
  function Washing() { mounts++; return React.createElement('div', null, 'Original washing controls'); }
  const child = React.createElement(Washing);
  const locked = renderToStaticMarkup(React.createElement(Gate, null, child));
  assert.match(locked, /Protected page · WSH</);
  assert.match(locked, /Locked WSH page/);
  assert.match(locked, /Unlock protected pages/);
  assert.doesNotMatch(locked, /Original washing controls/);
  assert.equal(mounts, 0);
  assert.match(renderToStaticMarkup(React.createElement(Gate, { unlocked: true }, child)), /Original washing controls/);
  assert.equal(mounts, 1);
  renderToStaticMarkup(React.createElement(Gate, { unlocked: false }, child));
  assert.equal(mounts, 1);
  let unlockRequested = false;
  const gate = Gate({ onUnlock: () => { unlockRequested = true; } });
  React.Children.toArray(gate.props.children).find((element) => element.type === 'button').props.onClick();
  assert.equal(unlockRequested, true);
  assert.doesNotMatch(gateSource, /sessionStorage|LOGIN_PASSWORD|fetch\(/);
});

test('mobile navigation shows WSH2 normally and hides original WSH until unlocked', () => {
  const mobile = readFileSync(new URL('../src/components/ReqMobileNavigation.jsx', import.meta.url), 'utf8');
  assert.match(source, /protectedPagesUnlocked=\{areProtectedShortcutsUnlocked\}/);
  assert.match(mobile, /protectedPagesUnlocked = false/);
  const expression = mobile.match(/pages\.filter\(\(\[path\]\) => (.*?)\)\.map/)[1];
  const protectedPaths = new Set(JSON.parse(mobile.match(/const PROTECTED_PAGE_PATHS = new Set\((\[[^\]]+\])\)/)[1]));
  const visible = new Function('PROTECTED_PAGE_PATHS', 'path', 'protectedPagesUnlocked', `return ${expression}`).bind(null, protectedPaths);
  assert.equal(visible('wsh2', false), true);
  assert.equal(visible('wsh2', true), true);
  assert.equal(visible('train-washing', false), false);
  assert.equal(visible('train-washing', true), true);
  const pages = new Function(`return ${mobile.match(/const pages = (\[[\s\S]*?\]);/)[1]}`)();
  const pageKeys = new Function(`return ${mobile.match(/const pageKeys = (\[[^\]]+\]);/)[1]}`)();
  assert.equal(pages.length, pageKeys.length);
  assert.deepEqual(pages.slice(3, 6).map(([path]) => path), ['insertion', 'wsh2', 'possession']);
  assert.deepEqual(pages.slice(-2).map(([path]) => path), ['train-washing', 'roster']);
  assert.equal(pages[pageKeys.indexOf('washing')][0], 'train-washing');
  assert.equal(pages[pageKeys.indexOf('wsh2')][0], 'wsh2');
});

test('WSH2 occupies the former normal washing position and retains the normal website login', () => {
  assert.match(source, /activeTab === "wsh2" && \(\s*<Wsh2Workspace \/>\s*\)/);
  assert.doesNotMatch(source, /Wsh2ProtectedPage/);
  const first = source.indexOf('key: "insertion",');
  const last = source.indexOf('key: "possession",', first);
  assert.match(source.slice(first, last), /key: "wsh2",\s*label: "Wash Checklist",\s*code: "AWP",\s*to: "\/wsh2"/);
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const authenticatedRoutes = app.slice(app.indexOf('<Route element={<ProtectedRoute />}>'), app.indexOf('{/* Add your page Route elements here */}'));
  for (const path of ['/wsh2', '/train-washing']) assert.ok(authenticatedRoutes.includes(`path="${path}"`));
});

test('the locked mobile WSH page hides its section controls, but unlocked WSH keeps them', () => {
  const mobile = readFileSync(new URL('../src/components/ReqMobileNavigation.jsx', import.meta.url), 'utf8');
  const module = { exports: {} };
  const code = ts.transpileModule(mobile, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('require', 'module', 'exports', code)((name) => name === 'lucide-react' ? icons : localRequire(name), module, module.exports);
  const Navigation = module.exports.default;
  const locked = renderToStaticMarkup(React.createElement(Navigation, { activePage: 'washing' }));
  assert.doesNotMatch(locked, /Washing sections|Excel import|Manual wash/);
  const unlocked = renderToStaticMarkup(React.createElement(Navigation, { activePage: 'washing', protectedPagesUnlocked: true }));
  assert.match(unlocked, /Washing sections/);
  assert.match(unlocked, /Excel import/);
  const checklist = renderToStaticMarkup(React.createElement(Navigation, { activePage: 'wsh2' }));
  assert.match(checklist, /Wash Checklist/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as icons from 'lucide-react';
import ts from 'typescript';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const page = read('src/pages/DepotStabling.jsx');
const app = read('src/App.jsx');
const gateSource = read('src/components/RosterProtectedPage.jsx');
const mobileSource = read('src/components/ReqMobileNavigation.jsx');
const localRequire = createRequire(import.meta.url);
function compileComponent(source, react = React) {
  const module = { exports: {} };
  const compiled = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  new Function('require', 'module', 'exports', compiled)(name => {
    if (name === 'react') return react;
    if (name === 'lucide-react') return icons;
    return localRequire(name);
  }, module, module.exports);
  return module.exports.default;
}
const Gate = compileComponent(gateSource);
const protectedKeys = JSON.parse(page.match(/const PROTECTED_SHORTCUT_KEYS = new Set\((\[[^\]]+\])\)/)[1]);

test('ROS sits with the locked shortcuts after WSH, not in the normal desktop group', () => {
  assert.ok(protectedKeys.includes('roster'));
  const entries = page.slice(page.indexOf('key: "stabling",'), page.indexOf('.filter(({ key }) => !PROTECTED_SHORTCUT_KEYS.has(key)'));
  const keys = [...entries.matchAll(/key: "([^"]+)"/g)].map((match) => match[1]);
  assert.equal(keys.filter(key => key === 'roster').length, 1);
  assert.equal(keys[keys.indexOf('washing') + 1], 'roster');
  assert.equal(keys[keys.indexOf('roster') + 1], 'alarm');
  assert.ok(keys.indexOf('roster') > keys.indexOf('odo'));
  const expression = page.match(/\.filter\(\(\{ key \}\) => (!PROTECTED_SHORTCUT_KEYS\.has\(key\) \|\| areProtectedShortcutsUnlocked)\)/)[1];
  const visible = new Function('PROTECTED_SHORTCUT_KEYS', 'areProtectedShortcutsUnlocked', 'key', `return ${expression}`);
  assert.equal(visible(new Set(protectedKeys), false, 'roster'), false);
  assert.equal(visible(new Set(protectedKeys), true, 'roster'), true);
});

test('both authenticated Roster URLs reach the same shared page gate', () => {
  const routes = app.slice(app.indexOf('<Route element={<ProtectedRoute />}>'), app.indexOf('{/* Add your page Route elements here */}'));
  for (const path of ['/roster', '/ros']) assert.ok(routes.includes(`path="${path}"`));
  const start = page.indexOf('  const getTabFromPath =');
  const end = page.indexOf('  const [activeTab, setActiveTab]', start);
  const getTab = vm.runInNewContext(`${page.slice(start, end)}\ngetTabFromPath`);
  assert.equal(getTab('/roster'), 'roster');
  assert.equal(getTab('/ros'), 'roster');
  assert.match(page, /activeTab === "roster" && \(\s*<RosterProtectedPage unlocked=\{areProtectedShortcutsUnlocked\} onUnlock=\{handleProtectedShortcutToggle\}>[\s\S]*?<RosterWorkspace \/>[\s\S]*?<\/RosterProtectedPage>/);
});

test('locked Roster does not mount its data-loading workspace and uses the existing unlock action', () => {
  let mounts = 0;
  const child = React.createElement(() => { mounts++; return React.createElement('div', null, 'Roster data and editing controls'); });
  for (const unlocked of [undefined, false]) {
    const html = renderToStaticMarkup(React.createElement(Gate, { unlocked }, child));
    assert.match(html, /Locked ROS page|Protected page · ROS/);
    assert.match(html, /Unlock protected pages/);
    assert.doesNotMatch(html, /Roster data and editing controls/);
  }
  assert.equal(mounts, 0);
  assert.match(renderToStaticMarkup(React.createElement(Gate, { unlocked: true }, child)), /Roster data and editing controls/);
  assert.equal(mounts, 1);
  renderToStaticMarkup(React.createElement(Gate, { unlocked: false }, child));
  assert.equal(mounts, 1);
  let requested = false;
  const gate = Gate({ onUnlock: () => { requested = true; } });
  React.Children.toArray(gate.props.children).find(child => child.type === 'button').props.onClick();
  assert.equal(requested, true);
  assert.doesNotMatch(gateSource, /sessionStorage|LOGIN_PASSWORD|fetch\(/);
});

test('the actual mobile menu hides locked ROS and its bottom tabs, then shows them after unlocking', () => {
  // Open the local menu for server rendering without changing production state.
  const Navigation = compileComponent(mobileSource, { ...React, useState: () => [true, () => {}] });
  const props = { activePage: 'roster', workspaceView: 'roster', theme: 'dark' };
  const locked = renderToStaticMarkup(React.createElement(Navigation, props));
  assert.doesNotMatch(locked, /href="#\/roster"|href="#\/train-washing"|Roster sections|Daily roster|Staff schedule/);
  assert.match(locked, /href="#\/wsh2"/);
  const unlocked = renderToStaticMarkup(React.createElement(Navigation, { ...props, protectedPagesUnlocked: true }));
  assert.match(unlocked, /href="#\/roster" aria-current="page"/);
  assert.match(unlocked, /Roster sections/);
  assert.match(unlocked, /Daily roster/);
  assert.match(unlocked, /Staff schedule/);
  assert.ok(unlocked.indexOf('href="#/roster"') > unlocked.indexOf('href="#/train-washing"'));
});

test('the shared relock action returns an open Roster page to Train Request', () => {
  const start = page.indexOf('  const lockProtectedShortcuts = useCallback(');
  const end = page.indexOf('  const handleProtectedShortcutToggle', start);
  const code = page.slice(start, end);
  const updates = {};
  const setters = [...new Set(code.match(/set[A-Z]\w+(?=\()/g))];
  const removed = [];
  let reloads = 0;
  const context = {
    ...Object.fromEntries(setters.map(name => [name, value => { updates[name] = value; }])),
    useCallback: callback => callback, activeTab: 'roster', PROTECTED_SHORTCUT_KEYS: new Set(protectedKeys),
    PROTECTED_SHORTCUTS_SESSION_KEY: 'protected', ODO_SESSION_KEY: 'odo', ALM_SESSION_KEY: 'alarm', OVT_SESSION_KEY: 'ovt', ADM_SESSION_KEY: 'admin',
    sessionStorage: { removeItem: key => removed.push(key) },
    window: { location: { hash: '#/roster', reload: () => { reloads++; } }, setTimeout: callback => callback() },
  };
  vm.runInNewContext(`${code}\nlockProtectedShortcuts();`, context);
  assert.equal(updates.setAreProtectedShortcutsUnlocked, false);
  assert.equal(updates.setActiveTab, 'stabling');
  assert.equal(context.window.location.hash, '#/depot-stabling');
  assert.ok(removed.includes('protected'));
  assert.equal(reloads, 1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { matchRoutes } from 'react-router-dom';
import { onRequest as entityRequest } from '../functions/api/entities/[[path]].js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = read('src/App.jsx');
const page = read('src/pages/DepotStabling.jsx');
const mobile = read('src/components/ReqMobileNavigation.jsx');

test('retired ABT and CHK URLs resolve to the existing not-found route, not a workspace', () => {
  const routes = [...app.matchAll(/<Route path="([^"]+)" element=\{<([A-Za-z]+) \/>\}/g)]
    .map(([, path, workspace]) => ({ path, workspace }));
  for (const path of ['/about', '/abt', '/checklist', '/chk']) {
    assert.equal(matchRoutes(routes, path).at(-1).route.workspace, 'PageNotFound', path);
    assert.ok(!page.includes(`path === "${path}"`), `Removed tab mapping: ${path}`);
    assert.ok(!page.includes(`to: "${path}"`), `Removed sidebar shortcut: ${path}`);
  }
});

test('the six remaining protected pages keep their shared lock and menu behavior', () => {
  const keys = [...page.match(/const PROTECTED_SHORTCUT_KEYS = new Set\(\[([^\]]+)\]\)/)[1].matchAll(/"([^"]+)"/g)]
    .map((match) => match[1]);
  assert.deepEqual(keys, ['odo', 'wsh2', 'alarm', 'overtime', 'admin', 'ats']);
  for (const source of [page, mobile]) {
    assert.doesNotMatch(source, /key: "(?:about|checklist)"|code: "(?:ABT|CHK)"|AboutWorkspace|ChecklistWorkspace/);
  }
  assert.match(page, /\.filter\(\(\{ key \}\) => !PROTECTED_SHORTCUT_KEYS\.has\(key\) \|\| areProtectedShortcutsUnlocked\)/);
  assert.match(page, /if \(PROTECTED_SHORTCUT_KEYS\.has\(activeTab\)\) \{\s*setActiveTab\("stabling"\)/);
});

test('retired checklist entity operations return 404 without touching any stored records', async () => {
  const db = { prepare() { assert.fail('Retired entity must not query or mutate the database'); } };
  for (const [method, suffix] of [['GET', ''], ['POST', ''], ['POST', '/filter'], ['POST', '/bulkCreate'], ['PUT', '/saved-id'], ['PATCH', '/saved-id'], ['DELETE', '/saved-id']]) {
    const response = await entityRequest({
      request: new Request(`https://railog.example/api/entities/ChecklistRecord${suffix}`, { method }),
      env: { DB: db }, params: { path: `ChecklistRecord${suffix}` },
    });
    assert.equal(response.status, 404, `${method} ${suffix}`);
    assert.match((await response.json()).error, /Unknown entity/);
  }
  assert.doesNotMatch(read('src/api/base44Client.js'), /['"]ChecklistRecord['"]/);
});

test('ABT and CHK page modules, page-only API helpers and unused build metadata are removed', () => {
  for (const path of [
    'src/components/AboutWorkspace.jsx', 'src/components/ChecklistWorkspace.jsx',
    'src/lib/checklistRecords.js', 'base44/entities/ChecklistRecord.jsonc',
    'functions/api/site-updates.js', 'functions/lib/site-updates.js',
  ]) assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), false, path);
  assert.doesNotMatch(read('vite.config.js'), /RAILOG_BUILD|CF_PAGES_COMMIT_SHA/);
});

test('removing CHK does not remove PST/FLDC, APU or WSH2 checklist functionality', () => {
  assert.ok(existsSync(new URL('../src/components/PstFldcChecklist.jsx', import.meta.url)));
  assert.ok(existsSync(new URL('../src/pstFldcChecklist.css', import.meta.url)));
  assert.ok(existsSync(new URL('../src/apuMismatchChecklist.css', import.meta.url)));
  assert.match(app, /path="\/wsh2"/);
  assert.match(app, /path="\/pst-train-prep"/);
  assert.match(page, /<Wsh2ProtectedPage unlocked=\{areProtectedShortcutsUnlocked\}/);
  assert.match(page, /<Wsh2Workspace \/>/);
  assert.match(read('src/components/PstExcelFormatLogPanel.jsx'), /<PstFldcChecklist\b/);
  assert.ok(existsSync(new URL('../functions/api/wsh2.js', import.meta.url)));
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { createAuthMiddleware } from '../functions/_middleware.js';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const origin = 'https://rail.example';
const retiredPaths = [
  '/removal-scan', '/removal-scan/', '/removal-scan.html',
  '/removal-scan-assets/removal-scan.js', '/removal-scan-assets/removal-scan.css',
  '/api/removal-scan?id=343f2c88-f64e-42f8-846f-1ea7fc79d428',
];

test('retired QR pages, assets and API cannot read sessions, upload, confirm or apply in any auth mode', async () => {
  for (const mode of ['custom_pin', 'cloudflare_access', 'disabled']) {
    const middleware = createAuthMiddleware({
      resolveMode: () => mode,
      authorizeCustom: async () => { throw new Error('A retired QR must not request login.'); },
      authorizeAccess: async () => { throw new Error('A retired QR must not request login.'); },
    });
    for (const path of retiredPaths) {
      for (const method of ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE']) {
        let nextCalls = 0;
        const response = await middleware({
          request: new Request(`${origin}${path}`, { method, headers: { 'X-Removal-Scan-Token': 'a'.repeat(64) } }),
          // No DB or OCR bindings: the terminal response must not use them.
          env: {}, data: {},
          next: async () => { nextCalls++; return new Response('operational data'); },
        });
        assert.equal(response.status, 410, `${mode} ${method} ${path}`);
        assert.equal(nextCalls, 0);
        assert.match(response.headers.get('Cache-Control'), /no-store/);
        if (method === 'HEAD') assert.equal(await response.text(), '');
        else {
          const body = await response.json();
          assert.equal(body.success, false);
          assert.match(body.error, /QR scanning has been removed/);
          assert.equal(body.extraction, undefined);
          assert.equal(body.target, undefined);
        }
      }
    }
  }
});

test('QR tokens no longer bypass authentication on dashboard assets or operational APIs', async () => {
  for (const mode of ['custom_pin', 'cloudflare_access']) {
    const denied = async () => ({ authorized: false, status: 401, reason: 'missing_session' });
    const middleware = createAuthMiddleware({ resolveMode: () => mode, authorizeCustom: denied, authorizeAccess: denied });
    for (const path of ['/', '/api/entities/TrainRem', '/api/maintenance-image', '/assets/main.js', '/removal-scan-assets-other/main.js']) {
      let nextCalls = 0;
      const response = await middleware({
        request: new Request(`${origin}${path}`, { headers: { 'X-Removal-Scan-Token': 'a'.repeat(64) } }),
        env: {}, data: {}, next: async () => { nextCalls++; return new Response('private'); },
      });
      assert.equal(response.status, 401, `${mode} ${path}`);
      assert.equal(nextCalls, 0);
    }
  }
});

test('authenticated manual removal data and unrelated maintenance image upload still reach their handlers', async () => {
  for (const mode of ['custom_pin', 'cloudflare_access']) {
    const authorized = async () => ({ authorized: true, email: 'owner@example.test', payload: { sub: 'owner' } });
    const middleware = createAuthMiddleware({ resolveMode: () => mode, authorizeCustom: authorized, authorizeAccess: authorized });
    for (const path of ['/api/entities/TrainRem', '/api/maintenance-image']) {
      const response = await middleware({
        request: new Request(`${origin}${path}`, { method: 'POST', headers: { Origin: origin } }),
        env: {}, data: {}, next: async () => new Response('existing handler'),
      });
      assert.equal(response.status, 200);
      assert.equal(await response.text(), 'existing handler');
    }
  }
});

test('Removal summary keeps manual entry, syncing, Undo, copy and PDF without scanner code or build assets', () => {
  const page = source('src/pages/DepotStabling.jsx');
  assert.doesNotMatch(page, /RemovalScan|applyRemovalImageAssignments|removalScanFingerprint|trainRemAppliedScanRef/);
  for (const control of ['trainRemTrainIdRefs', 'trainRemTidRefs', 'scheduleTrainRemSave', 'saveTrainRemToDb', 'handleTrainRemUndo', 'handleCopyDepotTrainList', 'handleTrainRemPdfDownload']) {
    assert.ok(page.includes(control), `${control} must remain`);
  }
  assert.doesNotMatch(source('src/App.jsx'), /RemovalScan|removal-scan/);
  assert.doesNotMatch(source('scripts/preview-compact-slate.jsx'), /RemovalScan|removal-scan/);
  assert.doesNotMatch(source('scripts/preview-compact-slate.mjs'), /previewRemovalScan|removal-scan/);
  const pkg = JSON.parse(source('package.json'));
  const lock = JSON.parse(source('package-lock.json'));
  assert.equal(pkg.scripts.build, 'vite build');
  assert.equal(pkg.dependencies.qrcode, undefined);
  assert.equal(lock.packages[''].dependencies.qrcode, undefined);
  assert.equal(lock.packages['node_modules/qrcode'], undefined);
  for (const path of ['public/removal-scan.html', 'src/removal-scan-main.jsx', 'vite.removal-scan.config.js', 'functions/api/removal-scan.js', 'functions/lib/removal-scan-access.js', 'functions/lib/removal-image-parser.js', 'src/components/depot/RemovalScan.jsx', 'src/components/depot/RemovalScan.css', 'src/lib/removalImageAssignments.js', 'src/lib/removalScanReview.js']) {
    assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), false, `${path} must be removed`);
  }
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const siteRoot = path.join(repositoryRoot, 'oauth-info-site');

const routes = new Map([
  ['/', 'index.html'],
  ['/privacy/', path.join('privacy', 'index.html')],
  ['/terms/', path.join('terms', 'index.html')],
]);

async function readSiteFile(relativePath) {
  return readFile(path.join(siteRoot, relativePath), 'utf8');
}

test('publishes the required public OAuth information routes', async () => {
  for (const [route, relativePath] of routes) {
    const html = await readSiteFile(relativePath);
    assert.match(html, /<meta name="viewport"/);
    assert.match(html, /<link rel="canonical" href="https:\/\/l3-dc-otp-info\.pages\.dev\//);
    assert.match(html, /<meta property="og:image" content="https:\/\/l3-dc-otp-info\.pages\.dev\/og\.png">/);
    assert.match(html, /href="\/privacy\/"/);
    assert.match(html, /href="\/terms\/"/);
    assert.doesNotMatch(html, /<(?:form|input|iframe|script)\b/i, route);
  }
});

test('keeps every internal page asset and navigation target resolvable', async () => {
  for (const relativePath of routes.values()) {
    const html = await readSiteFile(relativePath);
    const references = [...html.matchAll(/(?:href|src)="(\/[^"]+)"/g)]
      .map((match) => match[1])
      .filter((reference) => !reference.startsWith('//'));

    for (const reference of references) {
      const cleanReference = reference.split(/[?#]/, 1)[0];
      const mappedPath = routes.get(cleanReference)
        || cleanReference.replace(/^\//, '');
      await assert.doesNotReject(
        readFile(path.join(siteRoot, mappedPath)),
        `${relativePath} contains an unresolved reference: ${reference}`,
      );
    }
  }
});

test('accurately documents the narrow Gmail permission and data handling', async () => {
  const home = await readSiteFile('index.html');
  const privacy = await readSiteFile(path.join('privacy', 'index.html'));
  const terms = await readSiteFile(path.join('terms', 'index.html'));

  assert.match(home, /gmail\.send only/);
  assert.match(home, /No reading or browsing/);
  assert.match(home, /Approved staff allowlist/);
  assert.match(home, /bind the resulting session to the approved identity/i);
  assert.match(privacy, /https:\/\/www\.googleapis\.com\/auth\/gmail\.send/);
  assert.match(privacy, /Limited Use requirements/);
  assert.match(privacy, /does not store raw one-time codes/i);
  assert.match(privacy, /HMAC-derived identity keys/i);
  assert.match(privacy, /approximate online status/i);
  assert.match(terms, /must not share, forward, publish, reuse/i);
  assert.match(terms, /Enter only your own approved work address/i);

  for (const html of [home, privacy, terms]) {
    assert.doesNotMatch(html, /shared mailbox|fixed (?:authorized )?(?:mailbox|recipient)/i);
  }
});

test('ships restrictive static security headers', async () => {
  const headers = await readSiteFile('_headers');

  assert.match(headers, /Content-Security-Policy:.*connect-src 'none'/);
  assert.match(headers, /Content-Security-Policy:.*form-action 'none'/);
  assert.match(headers, /Content-Security-Policy:.*frame-ancestors 'none'/);
  assert.match(headers, /Content-Security-Policy:.*script-src 'none'/);
  assert.match(headers, /Referrer-Policy: no-referrer/);
  assert.match(headers, /X-Content-Type-Options: nosniff/);
});

test('includes a correctly sized social preview image', async () => {
  const image = await readFile(path.join(siteRoot, 'og.png'));

  assert.equal(image.subarray(1, 4).toString('ascii'), 'PNG');
  assert.equal(image.readUInt32BE(16), 1200);
  assert.equal(image.readUInt32BE(20), 630);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { onRequest as onEntityRequest } from '../functions/api/entities/[[path]].js';
import { onRequest as onHealthRequest } from '../functions/api/health.js';

test('entity and health APIs do not opt operational data into cross-origin reads', async () => {
  const request = new Request('https://railog.example.com/api/health', {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://attacker.example',
      'Access-Control-Request-Method': 'GET',
    },
  });

  const [entityResponse, healthResponse] = await Promise.all([
    onEntityRequest({ request, env: {}, params: { path: [] } }),
    onHealthRequest({ request, env: {} }),
  ]);

  for (const response of [entityResponse, healthResponse]) {
    assert.equal(response.status, 204);
    assert.equal(response.headers.has('Access-Control-Allow-Origin'), false);
    assert.equal(response.headers.has('Access-Control-Allow-Credentials'), false);
  }
});

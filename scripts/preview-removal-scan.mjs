import { createRemovalScanHandler } from '../functions/api/removal-scan.js';
import { memoryD1 } from '../tests/helpers/memory-d1.js';
import { trackingTableResult } from '../tests/fixtures/removal-tracking-table.js';

const env = { DB: memoryD1(), AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: 'https://preview.invalid', AZURE_DOCUMENT_INTELLIGENCE_KEY: 'local-demo-only' };
// Exercises the real session endpoint and parser without uploading to Azure.
const handler = createRemovalScanHandler({ readImage: async () => trackingTableResult() });

export async function previewRemovalScan(request, response) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 5 * 1024 * 1024) { response.writeHead(413); response.end(); return; }
    chunks.push(chunk);
  }
  const result = await handler({
    request: new Request(`http://${request.headers.host}${request.url}`, {
      method: request.method, headers: request.headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : Buffer.concat(chunks),
    }),
    env, data: { authUser: { email: 'local-preview@example.test' } },
  });
  response.writeHead(result.status, Object.fromEntries(result.headers));
  response.end(await result.text());
}

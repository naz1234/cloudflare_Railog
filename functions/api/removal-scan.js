import { isSameOriginBrowserRequest, mediaTypeForImage, runAzureLayout } from './maintenance-image.js';
import { extractRemovalAssignments } from '../lib/removal-image-parser.js';
import { inspectRemovalScanReview } from '../../src/lib/removalScanReview.js';
import { REMOVAL_SCAN_ID, REMOVAL_SCAN_TOKEN } from '../lib/removal-scan-access.js';

const TTL_MS = 15 * 60 * 1000;
const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const hash = async (value) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
  .map((byte) => byte.toString(16).padStart(2, '0')).join('');

async function schema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS removal_scan_sessions (
    id TEXT PRIMARY KEY, owner TEXT NOT NULL, token_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
    target_json TEXT NOT NULL, extraction_json TEXT
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS removal_scan_expiry ON removal_scan_sessions(expires_at)').run();
}

async function readBoundedBody(request, limit, message) {
  if (Number(request.headers.get('Content-Length')) > limit) fail(message, 413);
  if (!request.body) return [];
  const reader = request.body.getReader(), chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        fail(message, 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return chunks;
}

async function readJson(request) {
  const content = await new Blob(await readBoundedBody(request, 24000, 'The request is too large.')).text();
  try { return JSON.parse(content); } catch { fail('Invalid request.'); }
}

async function readImageForm(request) {
  if (!request.body || !request.headers.get('Content-Type')?.startsWith('multipart/form-data;')) fail('Choose a photo first.');
  const chunks = await readBoundedBody(request, 5 * 1024 * 1024, 'Please use an image smaller than 4 MB.');
  try {
    return await new Response(new Blob(chunks), { headers: { 'Content-Type': request.headers.get('Content-Type') } }).formData();
  } catch { fail('Choose a valid photo upload.'); }
}

function validateTarget(value) {
  if (!value || !Array.isArray(value.rows) || !value.rows.length || value.rows.length > 300) fail('Select a removal period first.');
  const rows = value.rows.map((row) => {
    const tid = String(row.tid || ''), trainId = String(row.trainId || '');
    if ((tid && !/^[1-9]\d{2}$/.test(tid)) || (trainId && !/^\d{2}$/.test(trainId))) fail('Finish editing train numbers and TIDs before scanning.');
    return { tid, trainId };
  });
  if (!rows.some((row) => row.tid)) fail('This period has no TIDs to match.');
  return { period: String(value.period || '').slice(0, 32), timetable: String(value.timetable || '').slice(0, 40), rows, supportsPartial: value.supportsPartial === true, supportsCorrections: value.supportsCorrections === true };
}

export function createRemovalScanHandler({ readImage = runAzureLayout, now = Date.now } = {}) {
  return async ({ request, env, data = {} }) => {
    try {
      const identity = data.authUser?.email || data.accessUser?.email;
      const id = new URL(request.url).searchParams.get('id');
      const token = request.headers.get('X-Removal-Scan-Token') || '';
      if (!identity && (!id || !REMOVAL_SCAN_TOKEN.test(token))) fail('Open a valid QR link, or sign in on the computer to create one.', 401);
      if (!env.DB) fail('The removal scanner database is unavailable.', 503);
      if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(request.method)) fail('Method not allowed.', 405);
      if (request.method !== 'GET' && !isSameOriginBrowserRequest(request)) fail('Cross-site requests are not allowed.', 403);
      if (id && !REMOVAL_SCAN_ID.test(id)) fail('Invalid scan link.', 404);
      const db = env.DB, owner = identity ? await hash(identity.toLowerCase()) : null, time = now();
      await schema(db);
      if (!id) {
        if (!identity) fail('Sign in on the computer to create a QR.', 401);
        if (request.method !== 'POST') fail('Missing scan session.');
        const body = await readJson(request);
        const target = validateTarget(body.target);
        await db.prepare('DELETE FROM removal_scan_sessions WHERE expires_at <= ?').bind(time).run();
        const active = await db.prepare("SELECT COUNT(*) AS count FROM removal_scan_sessions WHERE owner = ? AND status NOT IN ('applied', 'cancelled')").bind(owner).first();
        if (Number(active?.count) >= 5) fail('Close an existing scan or wait for it to expire before creating another QR.', 429);
        const sessionId = crypto.randomUUID();
        const token = Array.from(crypto.getRandomValues(new Uint8Array(32))).map((byte) => byte.toString(16).padStart(2, '0')).join('');
        await db.prepare('INSERT INTO removal_scan_sessions (id, owner, token_hash, expires_at, status, target_json) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(sessionId, owner, await hash(token), time + TTL_MS, 'waiting', JSON.stringify(target)).run();
        return json({ success: true, id: sessionId, token, expiresAt: time + TTL_MS, target, status: 'waiting' });
      }
      const session = await db.prepare('SELECT * FROM removal_scan_sessions WHERE id = ?').bind(id).first();
      if (!session || session.expires_at <= time) fail('This QR has expired. Open QR again on the computer.', 410);
      const isOwner = session.owner === owner;
      const validToken = REMOVAL_SCAN_TOKEN.test(token) && await hash(token) === session.token_hash;
      if (!isOwner && !validToken) fail('This scan belongs to another session.', 403);
      if (!isOwner && session.status === 'cancelled') fail('This QR was closed. Open a new QR on the computer.', 410);
      if (!isOwner && session.status === 'applied') {
        // A spent capability exposes only its completion receipt for phone polling.
        if (request.method !== 'GET') fail('This QR has already been used. Open a new QR on the computer.', 410);
        return json({ success: true, id, status: 'applied', expiresAt: session.expires_at });
      }
      const target = JSON.parse(session.target_json);
      const extraction = session.extraction_json ? JSON.parse(session.extraction_json) : null;
      if (request.method === 'GET') return json({ success: true, id, status: session.status, expiresAt: session.expires_at, target, extraction });
      if (request.method === 'DELETE') {
        if (!isOwner) fail('Only the computer that opened QR can cancel it.', 403);
        await db.prepare("UPDATE removal_scan_sessions SET status = 'cancelled', extraction_json = NULL WHERE id = ?").bind(id).run();
        return json({ success: true, status: 'cancelled' });
      }
      if (request.method === 'PATCH') {
        const body = await readJson(request);
        if (body.action === 'apply') {
          if (!isOwner || session.status !== 'ready') fail('The scan is not ready to apply.', 409);
          await db.prepare("UPDATE removal_scan_sessions SET status = 'applied' WHERE id = ? AND status = 'ready'").bind(id).run();
          return json({ success: true, status: 'applied' });
        }
        if (body.action !== 'confirm' || body.reviewed !== true || session.status !== 'review' || !extraction) fail('Review the detected table before updating.', 409);
        if (extraction.partial && body.partial !== true) fail('Refresh this scanner page and review the cropped-table warning before updating.', 409);
        if (target.supportsCorrections && body.rows === undefined) fail('Refresh the scanner page and review the current Vehicle / Tracking ID fields before updating.', 409);
        let reviewedExtraction = extraction;
        if (body.rows !== undefined) {
          if (!target.supportsCorrections || body.reviewId !== extraction.reviewId) fail('The review changed. Refresh the scanner and check the latest photo.', 409);
          if (!Array.isArray(body.rows) || body.rows.length !== extraction.rows.length
            || body.rows.some((row) => typeof row?.vehicleId !== 'string' || typeof row?.tid !== 'string' || row.vehicleId.length > 16 || row.tid.length > 16)) fail('Correct each detected row without adding or removing rows.');
          const review = inspectRemovalScanReview(body.rows);
          if (!review.valid) fail(review.errors.find(Boolean));
          reviewedExtraction = { ...extraction, rows: review.rows, assignedCount: review.assignedCount, requiresCorrection: false };
        }
        if (reviewedExtraction.requiresCorrection) fail('Correct the highlighted vehicle / Tracking IDs before updating.', 409);
        const tids = new Set(target.rows.map((row) => row.tid));
        if (reviewedExtraction.assignedCount && !reviewedExtraction.rows.some((row) => row.tid && tids.has(row.tid))) {
          fail('None of these TIDs match the selected period. Choose the correct timetable on the computer.');
        }
        const changed = await db.prepare("UPDATE removal_scan_sessions SET status = 'ready', extraction_json = ? WHERE id = ? AND status = 'review' AND expires_at > ? AND extraction_json = ?")
          .bind(JSON.stringify(reviewedExtraction), id, now(), session.extraction_json).run();
        if (!changed.meta.changes) fail('The scan changed or expired. Open QR again.', 409);
        return json({ success: true, status: 'ready', extraction: reviewedExtraction });
      }
      if (!env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT || !env.AZURE_DOCUMENT_INTELLIGENCE_KEY) fail('Azure OCR is not configured. Use the same Azure secrets as Maintenance Req. Image.', 503);
      if (!['waiting', 'review', 'error'].includes(session.status)) fail('This scan is already processing or complete.', 409);
      if (session.attempts >= 4) fail('Four images have been tried. Open a new QR to try again.', 429);
      const form = await readImageForm(request), file = form.get('image');
      if (!file || typeof file.arrayBuffer !== 'function') fail('Choose a photo first.');
      const mediaType = mediaTypeForImage(file);
      if (!mediaType) fail('Use a JPG, PNG, BMP, or TIFF image.', 415);
      if (!file.size || file.size > 4 * 1024 * 1024) fail('Use an image between 1 byte and 4 MB.', 413);
      const claimed = await db.prepare("UPDATE removal_scan_sessions SET status = 'reading', attempts = attempts + 1, extraction_json = NULL WHERE id = ? AND status IN ('waiting', 'review', 'error') AND attempts < 4 AND expires_at > ?")
        .bind(id, now()).run();
      if (!claimed.meta.changes) fail('Another image is already being read. Please wait.', 409);
      try {
        const result = await readImage({ env, mediaType, arrayBuffer: await file.arrayBuffer() });
        const parsed = extractRemovalAssignments(result, { allowCorrections: target.supportsCorrections });
        parsed.reviewId = crypto.randomUUID();
        if (parsed.partial && !target.supportsPartial) fail('For a cropped photo, refresh Removal summary on the computer and open a new QR. Or take a photo including both column headers.', 409);
        const saved = await db.prepare("UPDATE removal_scan_sessions SET status = 'review', extraction_json = ? WHERE id = ? AND status = 'reading' AND expires_at > ?")
          .bind(JSON.stringify(parsed), id, now()).run();
        if (!saved.meta.changes) fail('This scan was closed or expired. Open QR again.', 410);
        return json({ success: true, status: 'review', extraction: parsed, target, expiresAt: session.expires_at });
      } catch (error) {
        await db.prepare("UPDATE removal_scan_sessions SET status = 'error' WHERE id = ? AND status = 'reading'").bind(id).run();
        throw Object.assign(error, { status: error.status || 422 });
      }
    } catch (error) {
      return json({ success: false, error: error.status ? error.message : 'Unable to connect to the removal scanner. Please try again.' }, error.status || 500);
    }
  };
}

export const onRequest = createRemovalScanHandler();

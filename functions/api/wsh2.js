import { parseWsh2Workbook } from '../../src/lib/wsh2Workbook.js';
import { validateWashChanges, WSH2_MAX_FILE_BYTES } from '../../src/lib/wsh2Records.js';

const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
const rowColumns = `id, train_number AS trainNumber, next_wash AS nextWash, scheduled_date AS date,
  source_location AS sourceLocation, last_wash AS lastWash, location, completed, hvac, wash_type AS washType,
  depot, source_upload_id AS sourceUploadId, revision, completed_at AS completedAt, updated_at AS updatedAt, updated_by AS updatedBy`;
const hydrate = (row) => row ? { ...row, completed: Boolean(row.completed) } : null;
const readRow = async (db, id) => hydrate(await db.prepare(`SELECT ${rowColumns} FROM wsh2_washes WHERE id = ?`).bind(id).first());

async function boundedBody(request, maxBytes) {
  if (Number(request.headers.get('content-length') || 0) > maxBytes) throw new Error('Upload is too large. Choose an XLSX file smaller than 5 MB.');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Request body is missing.');
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) { await reader.cancel(); throw new Error('Request is too large.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

export async function onRequest({ request, env, data }) {
  // Only the root middleware supplies these verified identities. Code-only
  // sessions intentionally have no email; audit their member identity instead.
  // Never store a session token/token hash or accept identity from request input.
  const session = data?.authUser;
  const actor = session?.email || data?.accessUser?.email
    || (/^[a-f0-9]{64}$/.test(session?.tokenHash || '') && /^[a-f0-9]{64}$/.test(session?.memberHash || '')
      ? `member:${session.memberHash}` : '');
  if (!actor) return json({ error: 'Sign in to access WSH2.' }, 401);
  if (!env.DB || !env.WSH2_FILES) return json({ error: 'WSH2 needs the DB (D1) and WSH2_FILES (R2) bindings.' }, 503);
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405);
  const url = new URL(request.url);
  if (request.method !== 'GET' && request.headers.get('Origin') !== url.origin) return json({ error: 'Cross-site requests are not allowed.' }, 403);

  try {
    if (request.method === 'GET') {
      const uploadId = url.searchParams.get('download');
      if (uploadId) {
        const upload = await env.DB.prepare('SELECT file_name, object_key FROM wsh2_uploads WHERE id = ?').bind(uploadId).first();
        if (!upload) return json({ error: 'Upload not found.' }, 404);
        const object = await env.WSH2_FILES.get(upload.object_key);
        if (!object) return json({ error: 'The original Excel file is unavailable.' }, 404);
        return new Response(object.body, { headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="wash-source.xlsx"; filename*=UTF-8''${encodeURIComponent(upload.file_name)}`,
          'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        } });
      }
      const [rows, uploads] = await env.DB.batch([
        env.DB.prepare(`SELECT ${rowColumns} FROM wsh2_washes ORDER BY next_wash, train_number LIMIT 10001`),
        env.DB.prepare(`SELECT id, file_name AS fileName, row_count AS rowCount, date_from AS dateFrom, date_to AS dateTo, uploaded_at AS uploadedAt,
          (SELECT COUNT(*) FROM wsh2_washes WHERE source_upload_id = wsh2_uploads.id) AS currentRowCount
          FROM wsh2_uploads ORDER BY uploaded_at DESC, id`),
      ]);
      if (rows.results.length > 10000) return json({ error: 'WSH2 has reached its 10,000-row display limit. Contact the administrator to archive older schedules.' }, 409);
      return json({ rows: rows.results.map(hydrate), uploads: uploads.results, serverTime: new Date().toISOString() });
    }

    if (request.method === 'DELETE') {
      let body;
      try { body = JSON.parse(new TextDecoder().decode(await boundedBody(request, 1024))); } catch { return json({ error: 'Invalid delete request.' }, 400); }
      if (!body || typeof body.uploadId !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.uploadId) || body.confirm !== true) {
        return json({ error: 'Choose an uploaded Excel file and confirm its deletion.' }, 400);
      }
      const upload = await env.DB.prepare('SELECT object_key FROM wsh2_uploads WHERE id = ?').bind(body.uploadId).first();
      // Idempotent retry if another laptop already deleted this upload.
      if (!upload) return json({ deleted: true, uploadId: body.uploadId, removedRows: 0 });
      // Delete the private original first. If R2 fails, all D1 data stays intact.
      // If the D1 transaction fails, the upload record stays available for retry;
      // deleting an already-missing R2 object is safe. Never accept an object key from the client.
      await env.WSH2_FILES.delete(upload.object_key);
      const results = await env.DB.batch([
        env.DB.prepare('DELETE FROM wsh2_washes WHERE source_upload_id = ?').bind(body.uploadId),
        env.DB.prepare('DELETE FROM wsh2_uploads WHERE id = ?').bind(body.uploadId),
      ]);
      return json({ deleted: true, uploadId: body.uploadId, removedRows: results[0].meta.changes });
    }

    if (request.method === 'PATCH') {
      let body;
      try { body = JSON.parse(new TextDecoder().decode(await boundedBody(request, 4096))); } catch { return json({ error: 'Invalid update request.' }, 400); }
      if (typeof body.id !== 'string' || body.id.length > 80 || !Number.isSafeInteger(body.revision) || body.revision < 1) return json({ error: 'A wash row and its current revision are required.' }, 400);
      let changes;
      try { changes = validateWashChanges(body.changes); } catch (error) { return json({ error: error.message }, 400); }
      const fields = { location: 'location', completed: 'completed', hvac: 'hvac', washType: 'wash_type', depot: 'depot' };
      const keys = Object.keys(changes);
      const sets = keys.map((key) => `${fields[key]} = ?`);
      const values = keys.map((key) => key === 'completed' ? Number(changes[key]) : changes[key]);
      const now = new Date().toISOString();
      if ('completed' in changes) { sets.push('completed_at = ?'); values.push(changes.completed ? now : null); }
      const result = await env.DB.prepare(`UPDATE wsh2_washes SET ${sets.join(', ')}, revision = revision + 1, updated_at = ?, updated_by = ? WHERE id = ? AND revision = ?`).bind(...values, now, actor, body.id, body.revision).run();
      const row = await readRow(env.DB, body.id);
      if (!row) return json({ error: 'Wash entry not found. Refresh the schedule.' }, 404);
      if (!result.meta.changes) return json({ error: 'Another computer changed this train. The latest values are shown. Please check and try again.', row }, 409);
      return json({ row });
    }

    if (!(request.headers.get('content-type') || '').startsWith('multipart/form-data')) return json({ error: 'Upload an Excel file using the upload button.' }, 400);
    let file, bytes, parsed;
    try {
      const body = await boundedBody(request, WSH2_MAX_FILE_BYTES + 65536);
      const form = await new Response(body, { headers: { 'Content-Type': request.headers.get('content-type') } }).formData();
      file = form.get('file');
      if (!file || typeof file.arrayBuffer !== 'function' || !/\.xlsx$/i.test(file.name) || file.size > WSH2_MAX_FILE_BYTES) throw new Error('Choose an XLSX file smaller than 5 MB.');
      bytes = new Uint8Array(await file.arrayBuffer());
      parsed = parseWsh2Workbook(bytes);
    } catch (error) { return json({ error: error.message || 'Could not read the Excel workbook.' }, 400); }
    const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((value) => value.toString(16).padStart(2, '0')).join('');
    const previous = await env.DB.prepare('SELECT id, row_count FROM wsh2_uploads WHERE sha256 = ?').bind(sha256).first();
    if (previous) return json({ alreadyImported: true, rowCount: previous.row_count, uploadId: previous.id });

    const id = crypto.randomUUID();
    const objectKey = `wsh2/uploads/${id}.xlsx`;
    const now = new Date().toISOString();
    const filename = file.name.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 180);
    await env.WSH2_FILES.put(objectKey, bytes, { httpMetadata: { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
    try {
      await env.DB.batch([
        env.DB.prepare('INSERT INTO wsh2_uploads (id, sha256, file_name, object_key, row_count, date_from, date_to, uploaded_at, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(id, sha256, filename, objectKey, parsed.rows.length, parsed.rows[0].date, parsed.rows.at(-1).date, now, actor),
        ...parsed.rows.map((row) => env.DB.prepare(`INSERT INTO wsh2_washes
          (id, train_number, next_wash, scheduled_date, source_location, last_wash, source_upload_id, location, updated_at, updated_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET next_wash = excluded.next_wash, source_location = excluded.source_location,
          last_wash = excluded.last_wash, source_upload_id = excluded.source_upload_id,
          revision = wsh2_washes.revision + 1, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
          .bind(row.id, row.trainNumber, row.nextWash, row.date, row.sourceLocation, row.lastWash, id, row.sourceLocation, now, actor)),
      ]);
    } catch (error) {
      await env.WSH2_FILES.delete(objectKey).catch(() => {});
      // Concurrent duplicate uploads: one transaction wins; the other's own object is safe to remove.
      const winner = await env.DB.prepare('SELECT id, row_count FROM wsh2_uploads WHERE sha256 = ?').bind(sha256).first();
      if (winner) return json({ alreadyImported: true, rowCount: winner.row_count, uploadId: winner.id });
      throw error;
    }
    return json({ uploadId: id, rowCount: parsed.rows.length, duplicates: parsed.duplicates }, 201);
  } catch (error) {
    console.error('WSH2 storage request failed:', error);
    return json({ error: 'WSH2 could not save or load from shared storage. Check the D1 migration and R2 binding, then retry.' }, 503);
  }
}

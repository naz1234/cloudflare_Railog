export const WSH2_BATCH_MAX_TRAINS = 47;
export const WSH2_BATCH_MAX_INPUT = 500;

export function parseWashBatchTrains(input) {
  if (typeof input !== 'string' || input.length > WSH2_BATCH_MAX_INPUT) throw new Error('Enter train numbers in the format 01 02 03 04 05.');
  const tokens = input.trim().split(/[\s,;]+/).filter(Boolean);
  if (!tokens.length) throw new Error('Enter the train numbers that completed washing.');
  const invalid = tokens.filter(token => !/^\d{1,2}$/.test(token) || Number(token) < 1 || Number(token) > 47);
  if (invalid.length) throw new Error(`Use train numbers 01–47 only. Check: ${invalid.slice(0, 5).join(', ')}.`);
  return [...new Set(tokens.map(token => String(Number(token)).padStart(2, '0')))];
}

export function getWashBatchOptions(rows = [], uploads = []) {
  return uploads.flatMap(upload => {
    const counts = new Map();
    rows.filter(row => row.sourceUploadId === upload.id).forEach(row => counts.set(row.date, (counts.get(row.date) || 0) + 1));
    return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({
      key: `${upload.id}:${date}`, uploadId: upload.id, fileName: upload.fileName, date, count,
    }));
  });
}

export function getWashBatchSelection(options, selectedKey = '') {
  if (options.some(option => option.key === selectedKey)) return selectedKey;
  // Only one current file/date is unambiguous; never guess between dates.
  return options.length === 1 ? options[0].key : '';
}

export function buildWashBatchPlan(rows, uploads, uploadId, date, input) {
  if (!getWashBatchOptions(rows, uploads).some(option => option.uploadId === uploadId && option.date === date)) {
    throw new Error('Choose an available Excel file and date first.');
  }
  const trains = parseWashBatchTrains(input);
  const scope = rows.filter(row => row.sourceUploadId === uploadId && row.date === date);
  const selected = trains.map(train => scope.find(row => row.trainNumber === `L3-MV-${300 + Number(train)}`));
  const missing = trains.filter((_train, index) => !selected[index]);
  if (missing.length) throw new Error(`Not in the selected Excel file/date: ${missing.join(', ')}. Nothing was submitted.`);
  return { action: 'completeBatch', uploadId, date, rows: selected.map(row => ({ id: row.id, revision: row.revision })) };
}

export function validateWashBatchRequest(body) {
  if (!body || body.action !== 'completeBatch' || typeof body.uploadId !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.uploadId)) throw new Error('Choose an uploaded Excel file for the batch.');
  if (typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) throw new Error('Choose a valid Excel date.');
  const [year, month, day] = body.date.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 2000 || year > 2100 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error('Choose a valid Excel date.');
  if (!Array.isArray(body.rows) || !body.rows.length || body.rows.length > WSH2_BATCH_MAX_TRAINS) throw new Error('Submit between 1 and 47 trains.');
  const rows = body.rows.map(row => {
    if (!row || typeof row.id !== 'string' || !row.id.trim() || row.id.length > 80 || !Number.isSafeInteger(row.revision) || row.revision < 1) throw new Error('Refresh the selected wash entries before submitting.');
    return { id: row.id, revision: row.revision };
  });
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('A train may only appear once in the batch.');
  return { uploadId: body.uploadId, date: body.date, rows };
}

export function buildWashBatchUpdate(batch, now, actor) {
  // Materialize the matching revisions before updating any of them. Either
  // every selected row still belongs to this file/date and revision, or none
  // are changed. At 47 trains this uses exactly 100 bound parameters.
  const sql = `WITH requested(id, revision) AS (VALUES ${batch.rows.map(() => '(?, ?)').join(', ')}),
    valid(id) AS MATERIALIZED (
      SELECT current.id FROM wsh2_washes AS current JOIN requested
        ON current.id = requested.id AND current.revision = requested.revision
      WHERE current.source_upload_id = ? AND current.scheduled_date = ?
    )
    UPDATE wsh2_washes SET completed_at = CASE WHEN completed = 1 THEN completed_at ELSE ? END,
      completed = 1, hvac = 'ON', revision = revision + 1, updated_at = ?, updated_by = ?
    WHERE id IN (SELECT id FROM valid) AND (SELECT COUNT(*) FROM valid) = ?`;
  const values = [...batch.rows.flatMap(row => [row.id, row.revision]), batch.uploadId, batch.date, now, now, actor, batch.rows.length];
  return { sql, values };
}

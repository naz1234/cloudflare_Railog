export const PST_FLDC_HEADERS = ['Verified via FLDC?', 'Verified via FLDC by'];

export function getPstFldcDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function normalizePstFldcTrainId(value) {
  const match = String(value ?? '').trim().toUpperCase().match(/^(?:TS#3|T)?(\d{1,2})$/);
  const number = match ? Number(match[1]) : 0;
  return number >= 1 && number <= 47 ? String(number).padStart(2, '0') : '';
}

function normalizeTrainIds(ids = []) {
  return [...new Set((Array.isArray(ids) ? ids : []).map(normalizePstFldcTrainId).filter(Boolean))].sort();
}

export function collectPstFldcTrainIds(depot, entries = []) {
  if (!['west', 'east'].includes(depot)) return [];
  return normalizeTrainIds((Array.isArray(entries) ? entries : [])
    // The export list includes PST from its first (orange) click as well as confirmed (green) PST.
    .filter((entry) => entry?.type === 'PST' && entry.depot === depot && String(entry.endTime || '').trim())
    .map((entry) => entry.trainKey));
}

export function normalizePstFldcVerification(source = {}) {
  const depot = ['west', 'east'].includes(source?.depot) ? source.depot : '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(source?.date || '') ? source.date : '';
  const by = String(source?.by ?? '').trim();
  const trainIds = normalizeTrainIds(source?.trainIds);
  const status = source?.status === 'Yes' && depot && date && by && trainIds.length ? 'Yes' : '';
  return { depot, date, by, trainIds, status };
}

export function createPstFldcVerification(depot, trainIds, draft, date = getPstFldcDate()) {
  if (draft?.verified !== true) return null;
  const result = normalizePstFldcVerification({ depot, date, trainIds, by: draft?.by, status: 'Yes' });
  return result.status === 'Yes' ? result : null;
}

export function isPstFldcVerificationCurrent(source, depot, trainIds, date = getPstFldcDate()) {
  const value = normalizePstFldcVerification(source);
  const ids = normalizeTrainIds(trainIds);
  return value.status === 'Yes' && value.depot === depot && value.date === date &&
    ids.length > 0 && ids.join('|') === value.trainIds.join('|');
}

export function getPstFldcRecordKey(depot, date = getPstFldcDate()) {
  if (!['west', 'east'].includes(depot) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  // Old stabling/fleet attestations do not attest to the active PST export list.
  return `pst-fldc-v3:${date}:${depot}`;
}

export function selectPstFldcRecord(records = [], recordKey) {
  return [...(Array.isArray(records) ? records : [])].filter((row) => row?.recordKey === recordKey)
    .sort((a, b) => {
      const difference = (Date.parse(b.updatedAt || b.updated_date || '') || 0) - (Date.parse(a.updatedAt || a.updated_date || '') || 0);
      return difference || String(b.id || '').localeCompare(String(a.id || ''));
    })[0] || null;
}

export async function savePstFldcVerification(entity, source) {
  const verification = normalizePstFldcVerification(source);
  const recordKey = getPstFldcRecordKey(verification.depot, verification.date);
  if (!recordKey) throw new Error('Invalid FLDC depot or date.');
  const existing = selectPstFldcRecord(await entity.filter({ recordKey }), recordKey);
  const payload = { recordKey, stateKey: recordKey, scopeType: 'fldc', scopeDepot: verification.depot, verification, updatedAt: new Date().toISOString() };
  return existing?.id ? entity.update(existing.id, payload) : entity.create(payload);
}

export function appendPstFldcColumns(legacyRows, verifications = {}, depotFilter = '', date = getPstFldcDate()) {
  const depots = ['west', 'east'].includes(depotFilter) ? [depotFilter] : ['west', 'east'];
  return legacyRows.map((row, index) => {
    const original = Array.from({ length: 11 }, (_, column) => row?.[column] ?? '');
    if (index === 0) return [...original, ...PST_FLDC_HEADERS];
    if (index === 1) return [...original, 'Yes/No', 'DC Name'];
    const trainId = normalizePstFldcTrainId(original[2]);
    // Do not verify empty or Train-Prep-only rows, even if an old snapshot contains their ID.
    const hasPst = Boolean(String(original[5]).trim() && String(original[7]).trim());
    const matches = depots.map((depot) => normalizePstFldcVerification(verifications[depot]))
      .filter((value, position) => value.status === 'Yes' && value.date === date &&
        value.depot === depots[position] && trainId && hasPst && value.trainIds.includes(trainId));
    // Do not silently choose a depot if the same train appears in both snapshots.
    return [...original, matches.length === 1 ? 'Yes' : '', matches.length === 1 ? matches[0].by : ''];
  });
}

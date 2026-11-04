import { WSH2_BATCH_MAX_INPUT } from './wsh2BatchCompletion.js';

// Search uses short train numbers (01–47); stored/imported vehicle IDs stay intact.
export function normalizeWashTrainSearch(value = '') {
  const query = String(value ?? '').trim();
  if (!query) return '';
  if (!/^\d{1,2}$/.test(query) || Number(query) < 1 || Number(query) > 47) return null;
  return String(Number(query)).padStart(2, '0');
}

// Return matching IDs only: searching never removes, reorders or changes rows.
export function findWashTrainMatches(rows = [], query = '') {
  const train = normalizeWashTrainSearch(query);
  if (!train) return new Set();
  const vehicle = `L3-MV-${300 + Number(train)}`;
  return new Set(rows.filter((row) => String(row.trainNumber || '').trim().toUpperCase() === vehicle).map((row) => row.id));
}

// Preview valid tokens while typing; submission still uses the stricter batch validator.
export function findWashBatchTrainMatches(rows = [], { input = '', uploadId = '', date = '' } = {}) {
  if (typeof input !== 'string' || input.length > WSH2_BATCH_MAX_INPUT) return new Set();
  const vehicles = new Set(input.trim().split(/[\s,;]+/).map(normalizeWashTrainSearch).filter(Boolean).map(train => `L3-MV-${300 + Number(train)}`));
  return new Set(rows.filter(row => (!uploadId || row.sourceUploadId === uploadId) && (!date || row.date === date)
    && vehicles.has(String(row.trainNumber || '').trim().toUpperCase())).map(row => row.id));
}

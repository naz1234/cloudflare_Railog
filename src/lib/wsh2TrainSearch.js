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

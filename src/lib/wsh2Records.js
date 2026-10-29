// Wash times are depot wall-clock times. Never convert them through the browser timezone.
export const WSH2_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const WSH2_MAX_ROWS = 500;
export const WSH2_FIELDS = ['location', 'completed', 'hvac', 'washType', 'depot'];
export const WSH2_LOCATIONS = ['OPE', 'MAINT'];

export function washRecordId(trainNumber, date) {
  return `${date}_${trainNumber}`;
}

export function formatWashDate(date) {
  const [year, month, day] = String(date).split('-').map(Number);
  return `${day} ${['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][month - 1]} ${year}`;
}

export function formatWashTime(value) {
  const [date, time] = value.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return `${month}/${day}/${String(year).slice(-2)} ${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}

export function groupWashRows(rows) {
  const groups = new Map();
  [...rows].sort((a, b) => a.nextWash.localeCompare(b.nextWash) || a.trainNumber.localeCompare(b.trainNumber)).forEach((row) => {
    if (!groups.has(row.date)) groups.set(row.date, { date: row.date, rows: [] });
    groups.get(row.date).rows.push(row);
  });
  return [...groups.values()];
}

export function validateWashChanges(changes) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new Error('Invalid wash changes.');
  const keys = Object.keys(changes);
  if (!keys.length || keys.some((key) => !WSH2_FIELDS.includes(key))) throw new Error('Only checklist fields can be updated.');
  if ('completed' in changes && typeof changes.completed !== 'boolean') throw new Error('Completed must be true or false.');
  if ('location' in changes && (typeof changes.location !== 'string' || !WSH2_LOCATIONS.includes(changes.location.trim().toUpperCase()))) throw new Error('Choose OPE or MAINT for Location.');
  for (const [key, values] of Object.entries({ hvac: ['', 'ON'], washType: ['', 'Partial', 'Full'], depot: ['', 'west', 'east'] })) {
    if (key in changes && !values.includes(changes[key])) throw new Error(`Invalid ${key} option.`);
  }
  return { ...changes, ...('location' in changes ? { location: changes.location.trim().toUpperCase() } : {}) };
}

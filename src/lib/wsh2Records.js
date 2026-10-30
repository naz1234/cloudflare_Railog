// Wash times are depot wall-clock times. Never convert them through the browser timezone.
export const WSH2_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const WSH2_MAX_ROWS = 500;
export const WSH2_FIELDS = ['location', 'completed', 'hvac', 'washType', 'depot'];
export const WSH2_LOCATIONS = ['OPE', 'MAINT'];
export const WSH2_PRINT_MAX_FILES = 2;
export const WSH2_PRINT_ROWS_PER_SECTION = 19;
export const WSH2_PRINT_MAX_SECTIONS = 2;

export function summarizeWashRows(rows) {
  const total = rows.length;
  const completed = rows.filter((row) => row.completed).length;
  return { total, completed, remaining: total - completed, progress: total ? Math.round(completed / total * 1000) / 10 : 0 };
}

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

export function getWashPrintSections(rows) {
  return groupWashRows(rows).flatMap((group) => {
    const sections = [];
    for (let offset = 0; offset < group.rows.length; offset += WSH2_PRINT_ROWS_PER_SECTION) {
      sections.push({ date: group.date, rows: group.rows.slice(offset, offset + WSH2_PRINT_ROWS_PER_SECTION), offset, continued: offset > 0 });
    }
    return sections;
  });
}

export function selectWashPrintRows(rows, uploads, selectedIds) {
  if (!Array.isArray(selectedIds) || !selectedIds.length || selectedIds.length > WSH2_PRINT_MAX_FILES || new Set(selectedIds).size !== selectedIds.length) {
    throw new Error('Choose one or two Excel files to print.');
  }
  const selected = new Set(selectedIds);
  for (const id of selected) {
    const upload = uploads.find((item) => item.id === id);
    if (!upload) throw new Error('A selected Excel file is no longer available. Choose again.');
    if (!rows.some((row) => row.sourceUploadId === id)) throw new Error(`${upload.fileName} has no current checklist rows. Choose another file.`);
  }
  const printableRows = rows.filter((row) => selected.has(row.sourceUploadId));
  const sections = getWashPrintSections(printableRows);
  if (sections.length > WSH2_PRINT_MAX_SECTIONS) throw new Error('These files need more than one page. Choose fewer files or a shorter schedule (up to two tables of 19 trains).');
  return { rows: printableRows, sectionCount: sections.length };
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

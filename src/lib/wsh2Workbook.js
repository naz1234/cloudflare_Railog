import * as XLSX from 'xlsx';
import { WSH2_MAX_FILE_BYTES, WSH2_MAX_ROWS, washRecordId } from './wsh2Records.js';

const headerKey = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Check the ZIP directory before SheetJS inflates any workbook entries.
function checkArchive(bytes) {
  if (!bytes.length || bytes.length > WSH2_MAX_FILE_BYTES) throw new Error('Choose an XLSX file smaller than 5 MB.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error('This is not a valid XLSX workbook.');
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  let total = 0;
  if (!count || count > 1000) throw new Error('This workbook contains too many archive entries.');
  for (let i = 0; i < count; i++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) throw new Error('Invalid workbook archive.');
    total += view.getUint32(offset + 24, true);
    if (total > 32 * 1024 * 1024 || (view.getUint16(offset + 8, true) & 1)) throw new Error('Workbook is too large or encrypted.');
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
}

export function parseWashDate(value, date1904 = false) {
  let parts;
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value, { date1904 });
    if (parsed) parts = [parsed.y, parsed.m, parsed.d, parsed.H, parsed.M];
  } else {
    const text = String(value ?? '').trim();
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
    const us = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
    if (iso) parts = iso.slice(1).map(Number);
    else if (us) {
      let [, month, day, year, hour, minute, period] = us;
      year = Number(year) < 100 ? Number(year) + 2000 : Number(year);
      hour = Number(hour);
      if (period && (hour < 1 || hour > 12)) return null;
      if (period) hour = hour % 12 + (period.toUpperCase() === 'PM' ? 12 : 0);
      parts = [year, Number(month), Number(day), hour, Number(minute)];
    }
  }
  if (!parts) return null;
  const [year, month, day, hour, minute] = parts;
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (year < 2000 || year > 2100 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function parseWsh2Workbook(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  checkArchive(bytes);
  const workbook = XLSX.read(bytes, { type: 'array', cellDates: false, sheetRows: WSH2_MAX_ROWS + 25 });
  const records = new Map();
  let matched = false;
  let duplicates = 0;
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
    const headerIndex = rows.slice(0, 20).findIndex((row) => row.some((v) => headerKey(v) === 'trainnumber') && row.some((v) => headerKey(v) === 'nextwash'));
    if (headerIndex < 0) continue;
    matched = true;
    if (sheet['!fullref']) throw new Error(`${name}: more than ${WSH2_MAX_ROWS} rows. Split this file before uploading.`);
    const columns = rows[headerIndex].map(headerKey);
    const trainCol = columns.indexOf('trainnumber');
    const dateCol = columns.indexOf('nextwash');
    const locationCol = columns.indexOf('trainlocation');
    const lastCol = columns.indexOf('lastwash');
    rows.slice(headerIndex + 1).forEach((row, index) => {
      if (row.every((cell) => String(cell).trim() === '')) return;
      const trainNumber = String(row[trainCol] ?? '').trim().toUpperCase();
      const nextWash = parseWashDate(row[dateCol], Boolean(workbook.Workbook?.WBProps?.date1904));
      if (!/^L3-MV-\d{3}$/.test(trainNumber) || !nextWash) throw new Error(`${name}, row ${headerIndex + index + 2}: invalid Train Number or Next Wash. Nothing was imported.`);
      const date = nextWash.slice(0, 10);
      const id = washRecordId(trainNumber, date);
      if (records.has(id)) {
        if (records.get(id).nextWash !== nextWash) throw new Error(`${trainNumber} has two different wash times on ${date}. Please resolve them in Excel.`);
        duplicates++;
        return;
      }
      records.set(id, { id, trainNumber, nextWash, date, sourceLocation: String(row[locationCol] ?? '').trim().slice(0, 40), lastWash: parseWashDate(row[lastCol], Boolean(workbook.Workbook?.WBProps?.date1904)) || '' });
    });
  }
  if (!matched || !records.size) throw new Error('No wash records found. The workbook needs Train Number and Next Wash columns.');
  if (records.size > WSH2_MAX_ROWS) throw new Error(`A file can contain at most ${WSH2_MAX_ROWS} wash entries.`);
  return { rows: [...records.values()].sort((a, b) => a.nextWash.localeCompare(b.nextWash)), duplicates };
}

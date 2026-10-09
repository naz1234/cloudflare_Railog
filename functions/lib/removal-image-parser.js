// Read columns independently: a blank Tracking ID must never shift later rows.
const text = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
const heading = (value) => text(value).toUpperCase().replace(/[^A-Z]/g, '');
const vehicleHeading = (value) => /^(?:VEHICLE|TRAIN)(?:ID|NUMBER|NO)$/.test(heading(value));
const trackingHeading = (value) => /^(?:TRACKINGID|TID)$/.test(heading(value));

export function imageVehicleToTrainId(value) {
  const match = text(value).toUpperCase().match(/^(?:T\s*)?(\d{1,3})$/);
  if (!match) return '';
  let number = Number(match[1]);
  if (number >= 301 && number <= 399) number -= 300;
  return number >= 1 && number <= 99 ? String(number).padStart(2, '0') : '';
}

function overlaps(a, b) {
  return a.offset < b.offset + b.length && b.offset < a.offset + a.length;
}

function cellUncertain(cell, words) {
  const spans = cell?.spans || [];
  return words.some((word) => word.confidence < 0.85
    && spans.some((span) => word.span && overlaps(span, word.span)));
}

function tableRows(result) {
  const words = (result.pages || []).flatMap((page) => page.words || []);
  const rows = [];
  let recognized = false;
  let uncertain = false;
  for (const table of result.tables || []) {
    const cells = table.cells || [];
    const vehicle = cells.find((cell) => vehicleHeading(cell.content));
    const tracking = cells.find((cell) => trackingHeading(cell.content));
    if (!vehicle || !tracking || vehicle.rowIndex !== tracking.rowIndex) continue;
    recognized = true;
    for (let row = vehicle.rowIndex + 1; row < table.rowCount; row += 1) {
      const trainCell = cells.find((cell) => cell.rowIndex === row && cell.columnIndex === vehicle.columnIndex);
      const tidCell = cells.find((cell) => cell.rowIndex === row && cell.columnIndex === tracking.columnIndex);
      if (!text(trainCell?.content) && !text(tidCell?.content)) continue;
      if (text(trainCell?.content) && !looksNumeric(trainCell.content) && !text(tidCell?.content)) continue;
      if ((trainCell?.rowSpan || 1) > 1 || (tidCell?.rowSpan || 1) > 1
        || (trainCell?.columnSpan || 1) > 1 || (tidCell?.columnSpan || 1) > 1) {
        throw new Error('Some train rows overlap. Take a clearer photo of the complete table.');
      }
      uncertain ||= cellUncertain(trainCell, words) || cellUncertain(tidCell, words);
      rows.push({ vehicleId: text(trainCell?.content), tid: text(tidCell?.content) });
    }
  }
  return { recognized, rows, uncertain };
}

function box(item) {
  const polygon = item?.polygon || [];
  const xs = polygon.filter((_, index) => index % 2 === 0);
  const ys = polygon.filter((_, index) => index % 2 === 1);
  const bounds = { x: Math.min(...xs), right: Math.max(...xs), y: Math.min(...ys), bottom: Math.max(...ys) };
  return Object.values(bounds).every(Number.isFinite) && bounds.right > bounds.x && bounds.bottom > bounds.y ? bounds : null;
}

const centerX = (word) => (word.x + word.right) / 2;
const centerY = (word) => (word.y + word.bottom) / 2;
const looksNumeric = (value) => /^(?:T\s*)?\d[A-Z\d]{0,2}$/i.test(text(value));
const sameRow = (a, b) => Math.abs(centerY(a) - centerY(b)) < Math.max(a.bottom - a.y, b.bottom - b.y) * 0.65;
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const union = (a, b) => ({ x: Math.min(a.x, b.x), right: Math.max(a.right, b.right), y: Math.min(a.y, b.y), bottom: Math.max(a.bottom, b.bottom) });
function positionedWords(page) {
  return (page.words?.length ? page.words : page.lines || []).flatMap((word) => {
    const bounds = box(word);
    return bounds ? [{ ...word, ...bounds }] : [];
  });
}

// Azure may put all headings in one line, or split "Vehicle" and "ID" into
// separate words. Use the word polygons rather than requiring a whole line.
function columnHeading(page, words, predicate) {
  for (const item of [...(page.lines || []), ...words]) {
    if (predicate(item.content) && box(item)) return box(item);
  }
  for (const first of words) {
    if (!['ID', 'NUMBER', 'NO'].some((suffix) => predicate(`${first.content} ${suffix}`))) continue;
    for (const second of words) {
      if (second.x < first.right || !sameRow(first, second)) continue;
      if (second.x - first.right > (first.bottom - first.y) * 2.5) continue;
      if (predicate(`${first.content} ${second.content}`)) return union(first, second);
    }
  }
  return null;
}

function readPositionedColumns(words, { left, split, end, start }) {
  const below = words.filter((word) => word.y > start);
  const trains = below.filter((word) => centerX(word) >= left && centerX(word) < split && looksNumeric(word.content))
    .sort((a, b) => a.y - b.y);
  const tids = below.filter((word) => centerX(word) >= split && centerX(word) < end
    && text(word.content) && !/^[-–—]$/.test(text(word.content)));
  if (tids.some((tid) => trains.filter((train) => sameRow(train, tid)).length !== 1)) {
    throw new Error('Some Tracking IDs do not align with a vehicle. Use a clearer picture of both columns.');
  }
  return trains.map((train) => ({
    vehicleId: text(train.content),
    tid: tids.filter((tid) => sameRow(train, tid)).map((tid) => text(tid.content)).join(' '),
  }));
}

// Screen photos do not always become Azure tables. Align words by their actual
// positions under the visible headers instead of pairing flat OCR text.
function positionedRows(result) {
  const rows = [];
  let recognized = false;
  for (const page of result.pages || []) {
    const words = positionedWords(page);
    const a = columnHeading(page, words, vehicleHeading);
    const b = columnHeading(page, words, trackingHeading);
    const c = columnHeading(page, words, (value) => heading(value) === 'LOCATION');
    if (!a || !b || !c || !(a.right < b.x && b.right < c.x) || !sameRow(a, b) || !sameRow(b, c)) continue;
    recognized = true;
    rows.push(...readPositionedColumns(words, {
      left: a.x - (a.bottom - a.y) * 0.75,
      split: (a.right + b.x) / 2,
      end: (b.right + c.x) / 2,
      start: Math.max(a.bottom, b.bottom, c.bottom),
    }));
  }
  return { recognized, rows, uncertain: recognized };
}

function numericColumns(words) {
  const groups = [];
  for (const word of words.filter((item) => /^[1-9]\d{2}$/.test(text(item.content))).sort((a, b) => centerX(a) - centerX(b))) {
    const group = groups.at(-1);
    if (group && Math.abs(centerX(word) - median(group.map(centerX))) <= median(group.map((item) => item.right - item.x)) * 1.5) group.push(word);
    else groups.push([word]);
  }
  return groups.filter((group) => group.length >= 3);
}

// A crop without headings must have repeated 3xx vehicles, a distinct TID
// column and aligned depot/station locations. Never infer from flat OCR text.
// It is explicitly partial: missing TIDs cannot clear existing assignments.
function croppedRows(result) {
  const rows = [];
  for (const page of result.pages || []) {
    const words = positionedWords(page);
    const columns = numericColumns(words);
    const candidates = [];
    for (const vehicles of columns) {
      if (vehicles.filter((word) => /^3\d{2}$/.test(text(word.content)) && imageVehicleToTrainId(word.content)).length < 3) continue;
      const vehicleBox = vehicles.reduce(union);
      for (const tids of columns) {
        const tidBox = tids.reduce(union);
        if (vehicleBox.right >= tidBox.x) continue;
        const locations = words.filter((word) => word.x > tidBox.right && /(?:DEPOT|STATION|UNKNOWN)|^3[A-Z]\d$/i.test(text(word.content)));
        const pairs = vehicles.filter((vehicle) => tids.filter((tid) => sameRow(vehicle, tid)).length === 1
          && locations.some((location) => sameRow(vehicle, location)));
        if (pairs.length < 3) continue;
        candidates.push({
          left: vehicleBox.x - median(vehicles.map((word) => word.bottom - word.y)),
          split: (vehicleBox.right + tidBox.x) / 2,
          end: Math.min(tidBox.right + median(tids.map((word) => word.right - word.x)) * 0.75, Math.min(...locations.map((word) => word.x))),
          start: vehicleBox.y - 1,
        });
      }
    }
    if (candidates.length > 1) throw new Error('More than one possible Vehicle / Tracking ID column was found. Include the headers in a clearer picture.');
    if (candidates.length === 1) rows.push(...readPositionedColumns(words, candidates[0]));
  }
  return { recognized: rows.length > 0, rows, uncertain: true, partial: true };
}

export function extractRemovalAssignments(result = {}) {
  let parsed = tableRows(result);
  if (!parsed.recognized || !parsed.rows.length) parsed = positionedRows(result);
  if (!parsed.recognized || !parsed.rows.length) parsed = croppedRows(result);
  if (!parsed.recognized || !parsed.rows.length) {
    throw new Error('Vehicle ID and Tracking ID columns were not found. Include both headers and the complete table.');
  }
  const rows = [], seenTrains = new Map(), seenTids = new Map();
  for (const row of parsed.rows) {
    const trainId = imageVehicleToTrainId(row.vehicleId);
    const tid = /^[-–—]$/.test(row.tid) ? '' : row.tid;
    // 999 is the non-train placeholder in the vehicle list.
    if (row.vehicleId === '999' && !tid) continue;
    if (!trainId || (tid && !/^[1-9]\d{2}$/.test(tid))) {
      throw new Error(`Could not read vehicle ${row.vehicleId || '(blank)'} / TID ${tid || '(blank)'}. Use a clearer picture.`);
    }
    if (seenTrains.has(trainId) && seenTrains.get(trainId) !== tid) {
      throw new Error(`Train ${trainId} has conflicting TIDs. Check the picture and try again.`);
    }
    if (tid && seenTids.has(tid) && seenTids.get(tid) !== trainId) {
      throw new Error(`TID ${tid} is assigned to more than one train. Check the picture and try again.`);
    }
    if (!seenTrains.has(trainId)) rows.push({ vehicleId: row.vehicleId, trainId, tid });
    seenTrains.set(trainId, tid);
    if (tid) seenTids.set(tid, trainId);
  }
  if (!rows.length || rows.length > 99) throw new Error('No valid train table was found.');
  return { rows, uncertain: parsed.uncertain, partial: Boolean(parsed.partial), assignedCount: rows.filter((row) => row.tid).length };
}

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
  return { x: Math.min(...xs), right: Math.max(...xs), y: Math.min(...ys), bottom: Math.max(...ys) };
}

// Screen photos do not always become Azure tables. Align words by their actual
// positions under the visible headers instead of pairing flat OCR text.
function positionedRows(result) {
  const rows = [];
  let recognized = false;
  for (const page of result.pages || []) {
    const lines = page.lines || [];
    const vehicle = lines.find((line) => vehicleHeading(line.content));
    const tracking = lines.find((line) => trackingHeading(line.content));
    const location = lines.find((line) => heading(line.content) === 'LOCATION');
    if (!vehicle || !tracking || !location) continue;
    const a = box(vehicle), b = box(tracking), c = box(location);
    if (!(a.x < b.x && b.x < c.x)) continue;
    recognized = true;
    const words = (page.words || []).map((word) => ({ ...word, ...box(word) }));
    const start = Math.max(a.bottom, b.bottom);
    const split = (a.right + b.x) / 2;
    const end = (b.right + c.x) / 2;
    const trains = words.filter((word) => word.y > start && word.x < split)
      .sort((left, right) => left.y - right.y);
    for (const train of trains) {
      const y = (train.y + train.bottom) / 2;
      const matches = words.filter((word) => word.x >= split && word.x < end
        && Math.abs((word.y + word.bottom) / 2 - y) < (train.bottom - train.y) * 0.65);
      rows.push({ vehicleId: text(train.content), tid: matches.map((word) => text(word.content)).join(' ') });
    }
  }
  return { recognized, rows, uncertain: recognized };
}

export function extractRemovalAssignments(result = {}) {
  let parsed = tableRows(result);
  if (!parsed.recognized) parsed = positionedRows(result);
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
  return { rows, uncertain: parsed.uncertain, assignedCount: rows.filter((row) => row.tid).length };
}

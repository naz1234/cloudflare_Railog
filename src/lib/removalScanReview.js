const text = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');

export function imageVehicleToTrainId(value) {
  const match = text(value).toUpperCase().match(/^(?:T\s*)?(\d{1,3})$/);
  if (!match) return '';
  let number = Number(match[1]);
  if (number >= 301 && number <= 399) number -= 300;
  return number >= 1 && number <= 99 ? String(number).padStart(2, '0') : '';
}

// Shared by the phone and server: raw OCR digits are never guessed or repaired.
export function inspectRemovalScanReview(values = []) {
  if (!Array.isArray(values) || !values.length || values.length > 99) {
    return { rows: [], errors: ['The review must contain between 1 and 99 rows.'], valid: false, assignedCount: 0 };
  }
  const rows = values.map((value) => {
    const vehicleId = text(value?.vehicleId), rawTid = text(value?.tid);
    return { vehicleId, trainId: imageVehicleToTrainId(vehicleId), tid: /^[-–—]$/.test(rawTid) ? '' : rawTid };
  });
  const errors = rows.map((row, index) => !row.trainId
    ? `Row ${index + 1}: correct vehicle ${row.vehicleId || '(blank)'}. Use 301–399 or a train number 01–99.`
    : row.tid && !/^[1-9]\d{2}$/.test(row.tid) ? `Row ${index + 1}: correct the Tracking ID, or leave it blank if the photo has no TID.` : '');
  const trains = new Map(), tids = new Map();
  rows.forEach((row, index) => {
    for (const [value, seen, label] of [[row.trainId, trains, 'Train'], [row.tid, tids, 'TID']]) {
      if (!value) continue;
      if (seen.has(value)) {
        const message = `${label} ${value} appears more than once. Check both rows against the photo.`;
        errors[index] ||= message;
        errors[seen.get(value)] ||= message;
      } else seen.set(value, index);
    }
  });
  return { rows, errors, valid: errors.every((error) => !error), assignedCount: rows.filter((row, index) => row.tid && !errors[index]).length };
}

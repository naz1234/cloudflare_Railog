const PLAN_MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MIN_REQUIRED_CONFIDENCE = 0.8;

export const EMPTY_MAINTENANCE_EXTRACTION = Object.freeze({
  eveningDate: '',
  morningDate: '',
  eveningGToC: [],
  morningGToC: [],
  eveningPM: [],
  morningPM: [],
});

function formatPlanDate(dayValue, monthValue) {
  const day = Number(dayValue);
  const month = Number(monthValue);
  if (!Number.isInteger(day) || day < 1 || day > 31) return '';
  if (!Number.isInteger(month) || month < 1 || month > 12) return '';
  return `${String(day).padStart(2, '0')}-${PLAN_MONTH_LABELS[month - 1]}`;
}

export function normalizePlanDate(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';

  let match = text.match(/\b\d{4}[/.\-](\d{1,2})[/.\-](\d{1,2})\b/);
  if (match) return formatPlanDate(match[2], match[1]);

  match = text.match(/\b(\d{1,2})[/.\-](\d{1,2})(?:[/.\-]\d{2,4})?\b/);
  if (match) return formatPlanDate(match[1], match[2]);

  match = text.match(/\b(\d{1,2})\s*[-\s]\s*([A-Za-z]{3,9})\b/);
  if (match) {
    const monthIndex = PLAN_MONTH_LABELS.findIndex(
      (label) => label.toLowerCase() === match[2].slice(0, 3).toLowerCase()
    );
    return monthIndex >= 0 ? formatPlanDate(match[1], monthIndex + 1) : '';
  }

  return '';
}

export function trainNumberFromText(value) {
  const text = String(value ?? '').toUpperCase().trim();
  if (!text) return '';

  const match = text.match(/^(?:TS|T)?\s*0*(\d{1,2})(?!\d)/);
  if (!match) return '';

  const number = Number(match[1]);
  if (!Number.isInteger(number) || number < 1 || number > 99) return '';
  return String(number).padStart(2, '0');
}

export function extractPrefixedTrainList(value) {
  const text = String(value ?? '').toUpperCase();
  const trains = [];
  const seen = new Set();
  const pattern = /(?:^|[^A-Z0-9])TS\s*0*(\d{1,2})(?!\d)/g;

  for (const match of text.matchAll(pattern)) {
    const number = Number(match[1]);
    if (!Number.isInteger(number) || number < 1 || number > 99) continue;

    const train = String(number).padStart(2, '0');
    if (seen.has(train)) continue;
    seen.add(train);
    trains.push(train);
  }

  return trains;
}

function appendUnique(target, values) {
  const seen = new Set(target);
  values.forEach((value) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    target.push(value);
  });
}

function normalizeOcrText(value) {
  return String(value ?? '')
    .replace(/[|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function headerKey(value) {
  const text = normalizeOcrText(value).toUpperCase();
  if (!text) return '';
  if (text === '#' || text === 'NO.' || text === 'NO') return 'rowNumber';
  if (text.includes('FROM') && text.includes('BUILD')) return 'fromBuilding';
  if (text.includes('FROM') && text.includes('TRACK')) return 'fromTrack';
  if (text.includes('TO') && text.includes('BUILD')) return 'toBuilding';
  if (text.includes('TO') && text.includes('TRACK')) return 'toTrack';
  if (text.includes('BY') && text.includes('TIME')) return 'byTime';
  if (text.includes('TEAM') && text.includes('LEADER')) return 'teamLeader';
  if (text === 'TRAIN' || (text.includes('TRAIN') && text.includes('NUMBER')) || text.includes('TRAINSET')) return 'train';
  if (text.includes('NOTE')) return 'notes';
  return '';
}

function extractShift(value) {
  const text = normalizeOcrText(value).toUpperCase();
  if (/\bEVENING\b/.test(text)) return 'evening';
  if (/\bMORNING\b/.test(text)) return 'morning';
  return '';
}

function normalizeBuilding(value) {
  const text = normalizeOcrText(value).toUpperCase().replace(/[^A-Z]/g, '');
  return text.length === 1 ? text : '';
}

function cellCoversRow(cell, rowIndex) {
  const start = Number(cell?.rowIndex ?? -1);
  const span = Math.max(1, Number(cell?.rowSpan || 1));
  return rowIndex >= start && rowIndex < start + span;
}

function cellCoversColumn(cell, columnIndex) {
  const start = Number(cell?.columnIndex ?? -1);
  const span = Math.max(1, Number(cell?.columnSpan || 1));
  return columnIndex >= start && columnIndex < start + span;
}

function cellsForRow(table, rowIndex) {
  const seen = new Set();
  return (table?.cells || [])
    .filter((cell) => cellCoversRow(cell, rowIndex))
    .filter((cell) => {
      const key = `${cell.rowIndex}:${cell.columnIndex}:${cell.content}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => Number(left.columnIndex || 0) - Number(right.columnIndex || 0));
}

function cellAtColumn(table, rowIndex, columnIndex) {
  return (table?.cells || []).find(
    (cell) => cellCoversRow(cell, rowIndex) && cellCoversColumn(cell, columnIndex)
  );
}

function spansFor(value) {
  const spans = Array.isArray(value?.spans) ? value.spans : value?.span ? [value.span] : [];
  return spans
    .map((span) => ({ offset: Number(span?.offset), length: Number(span?.length) }))
    .filter((span) => Number.isFinite(span.offset) && Number.isFinite(span.length) && span.length > 0);
}

function spansOverlap(left, right) {
  return left.offset < right.offset + right.length && right.offset < left.offset + left.length;
}

function confidenceWords(analyzeResult) {
  return (analyzeResult?.pages || []).flatMap((page) => page?.words || []).filter(
    (word) => Number.isFinite(Number(word?.confidence)) && spansFor(word).length
  );
}

function confidenceForCell(cell, words) {
  if (!cell) return null;
  if (Number.isFinite(Number(cell.confidence))) return Number(cell.confidence);

  const cellSpans = spansFor(cell);
  if (!cellSpans.length) return null;

  const relevant = words.filter((word) => {
    const wordSpans = spansFor(word);
    return cellSpans.some((cellSpan) => wordSpans.some((wordSpan) => spansOverlap(cellSpan, wordSpan)));
  });
  if (!relevant.length) return null;
  return Math.min(...relevant.map((word) => Number(word.confidence)));
}

function createConfidenceTracker(analyzeResult) {
  const words = confidenceWords(analyzeResult);
  const inspectedCells = new Set();
  const lowConfidenceValues = [];
  const unverifiedConfidenceValues = [];

  return {
    inspect(cell, label) {
      if (!cell || inspectedCells.has(cell)) return;
      inspectedCells.add(cell);

      const confidence = confidenceForCell(cell, words);
      if (!Number.isFinite(confidence)) {
        unverifiedConfidenceValues.push(label);
      } else if (confidence < MIN_REQUIRED_CONFIDENCE) {
        lowConfidenceValues.push({ label, confidence: Number(confidence.toFixed(3)) });
      }
    },
    lowConfidenceValues,
    unverifiedConfidenceValues,
  };
}

function findHeader(table) {
  const rowIndexes = [...new Set((table?.cells || []).map((cell) => Number(cell.rowIndex || 0)))].sort(
    (left, right) => left - right
  );
  let best = null;

  rowIndexes.forEach((rowIndex) => {
    const columns = {};
    const headerCells = {};
    cellsForRow(table, rowIndex).forEach((cell) => {
      const key = headerKey(cell.content);
      if (key && columns[key] === undefined) {
        columns[key] = Number(cell.columnIndex || 0);
        headerCells[key] = cell;
      }
    });

    const required = ['train', 'fromBuilding', 'toBuilding', 'byTime'];
    const requiredScore = required.filter((key) => columns[key] !== undefined).length;
    const totalScore = Object.keys(columns).length;
    const score = requiredScore * 10 + totalScore;

    if (!best || score > best.score) best = { rowIndex, columns, headerCells, requiredScore, score };
  });

  return best?.requiredScore === 4 ? best : null;
}

function rowText(table, rowIndex) {
  return cellsForRow(table, rowIndex)
    .map((cell) => normalizeOcrText(cell.content))
    .filter(Boolean)
    .join(' | ');
}

function columnText(table, rowIndex, columnIndex) {
  if (columnIndex === undefined) return '';
  return normalizeOcrText(cellAtColumn(table, rowIndex, columnIndex)?.content);
}

function findBestTable(tables) {
  return (tables || []).reduce((best, table) => {
    const header = findHeader(table);
    if (!header) return best;

    const score = header.score + Math.min(20, Number(table.rowCount || 0));
    return !best || score > best.score ? { table, header, score } : best;
  }, null);
}

function logicalRowIndexes(table) {
  const rowCount = Number(table?.rowCount || 0);
  if (rowCount > 0) return Array.from({ length: rowCount }, (_, index) => index);

  const lastRow = Math.max(
    0,
    ...(table?.cells || []).map(
      (cell) => Number(cell.rowIndex || 0) + Math.max(1, Number(cell.rowSpan || 1))
    )
  );
  return Array.from({ length: lastRow }, (_, index) => index);
}

function hasAnyTrain(extraction) {
  return ['eveningGToC', 'morningGToC', 'eveningPM', 'morningPM'].some(
    (key) => extraction[key].length > 0
  );
}

export function extractMaintenancePlan(analyzeResult = {}) {
  const tables = analyzeResult?.tables || [];
  const selected = findBestTable(tables);
  if (!selected) {
    return {
      extraction: { ...EMPTY_MAINTENANCE_EXTRACTION },
      recognized: false,
      diagnostics: { tableCount: analyzeResult?.tables?.length || 0, movementRows: 0, pmRows: 0 },
    };
  }

  const { table, header } = selected;
  const confidence = createConfidenceTracker(analyzeResult);
  ['train', 'fromBuilding', 'toBuilding', 'byTime'].forEach((key) => {
    confidence.inspect(header.headerCells[key], `${key} header`);
  });
  const extraction = {
    eveningDate: '',
    morningDate: '',
    eveningGToC: [],
    morningGToC: [],
    eveningPM: [],
    morningPM: [],
  };
  const dateByShift = {};
  const conflictingDates = new Set();
  let movementRows = 0;
  let pmRows = 0;

  for (const rowIndex of logicalRowIndexes(table).filter((index) => index > header.rowIndex)) {
    const fullRowText = rowText(table, rowIndex);
    if (!fullRowText) continue;

    const byTimeCell = cellAtColumn(table, rowIndex, header.columns.byTime);
    const fromBuildingCell = cellAtColumn(table, rowIndex, header.columns.fromBuilding);
    const toBuildingCell = cellAtColumn(table, rowIndex, header.columns.toBuilding);
    const trainCell = cellAtColumn(table, rowIndex, header.columns.train);
    const byTimeText = normalizeOcrText(byTimeCell?.content);
    const shift = extractShift(byTimeText) || extractShift(fullRowText);

    const fromBuilding = normalizeBuilding(fromBuildingCell?.content);
    const toBuilding = normalizeBuilding(toBuildingCell?.content);
    if (fromBuilding !== 'G' || toBuilding !== 'C' || !shift) continue;

    const train = trainNumberFromText(trainCell?.content);
    if (!train) continue;

    confidence.inspect(trainCell, `${shift} G to C train`);
    confidence.inspect(fromBuildingCell, `${shift} from building`);
    confidence.inspect(toBuildingCell, `${shift} to building`);
    confidence.inspect(byTimeCell, `${shift} movement shift`);
    appendUnique(extraction[`${shift}GToC`], [train]);
    movementRows += 1;
  }

  tables.forEach((candidateTable) => {
    logicalRowIndexes(candidateTable).forEach((rowIndex) => {
      const fullRowText = rowText(candidateTable, rowIndex);
      const upperRowText = fullRowText.toUpperCase();
      const isSummaryText = upperRowText.includes('NEED THESE TRAIN')
        || upperRowText.includes('STABLING BUILDING');
      if (!isSummaryText) return;

      const shift = extractShift(fullRowText);
      const date = normalizePlanDate(fullRowText);
      const prefixedTrains = extractPrefixedTrainList(fullRowText);
      if (!shift || !date || !prefixedTrains.length) return;

      const logicalCells = cellsForRow(candidateTable, rowIndex);
      const shiftCell = logicalCells.find((cell) => extractShift(cell.content) === shift);
      const dateCell = logicalCells.find((cell) => normalizePlanDate(cell.content) === date);
      const trainCells = logicalCells.filter((cell) => extractPrefixedTrainList(cell.content).length);
      confidence.inspect(shiftCell, `${shift} PM shift`);
      confidence.inspect(dateCell, `${shift} PM date`);
      trainCells.forEach((cell) => confidence.inspect(cell, `${shift} PM train list`));

      if (dateByShift[shift] && dateByShift[shift] !== date) conflictingDates.add(shift);
      if (!dateByShift[shift]) dateByShift[shift] = date;
      appendUnique(extraction[`${shift}PM`], prefixedTrains);
      pmRows += 1;
    });
  });

  extraction.eveningDate = dateByShift.evening || '';
  extraction.morningDate = dateByShift.morning || '';

  const hasEveningEntries = extraction.eveningGToC.length > 0 || extraction.eveningPM.length > 0;
  const hasMorningEntries = extraction.morningGToC.length > 0 || extraction.morningPM.length > 0;
  const missingRequiredDate = (hasEveningEntries && !extraction.eveningDate)
    || (hasMorningEntries && !extraction.morningDate);
  const missingSummaryShifts = ['evening', 'morning'].filter((shift) => !dateByShift[shift]);

  return {
    extraction,
    recognized: Boolean(pmRows && hasAnyTrain(extraction)),
    uncertain: Boolean(
      conflictingDates.size
      || missingRequiredDate
      || missingSummaryShifts.length
      || confidence.lowConfidenceValues.length
      || confidence.unverifiedConfidenceValues.length
    ),
    diagnostics: {
      tableCount: analyzeResult?.tables?.length || 0,
      headerRow: header.rowIndex,
      movementRows,
      pmRows,
      conflictingDateShifts: [...conflictingDates],
      missingSummaryShifts,
      lowConfidenceValues: confidence.lowConfidenceValues,
      unverifiedConfidenceValues: confidence.unverifiedConfidenceValues,
    },
  };
}

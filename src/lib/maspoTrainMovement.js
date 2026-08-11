const MASPO_REFERENCE_PATTERN = /\bMASPO[\s_-]?(\d{6})[\s_-]?(\d{1,3})\b/i;
const EXCEL_FILE_PATTERN = /\.(?:xlsx|xlsm|xlsb|xls)$/i;
const ANY_TRAIN_SOURCE = "\\b(?:TRAIN\\s*SET|TS|TR|T)\\s*[-–—]?\\s*0*\\d{1,3}\\b";

const HEADER_ALIASES = {
  reference: [/occ\s*reference/i, /^reference(?:\s*(?:no\.?|number))?$/i],
  time: [/^time$/i, /^event\s*time$/i],
  location: [/^location$/i, /^area$/i],
  category: [/^category$/i, /^activity$/i, /^event\s*type$/i],
  summary: [/^summary$/i, /^details?$/i, /^remarks?$/i, /^description$/i],
};

function stringifyCell(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  return String(value).trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function addUtcDays(date, amount) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function formatDateIso(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function formatDateDisplay(dateIso) {
  if (!dateIso) return "";
  const parsed = new Date(`${dateIso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return dateIso;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function parseMaspoReferenceDate(reference = "") {
  const match = String(reference).match(MASPO_REFERENCE_PATTERN);
  if (!match) return null;
  const dateCode = match[1];
  const day = Number(dateCode.slice(0, 2));
  const month = Number(dateCode.slice(2, 4));
  const year = 2000 + Number(dateCode.slice(4, 6));
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return parsed;
}

function parseFileDate(fileName = "") {
  const compactMatch = String(fileName).match(/(?:^|\D)(\d{2})(\d{2})(\d{2})(?:\D|$)/);
  if (!compactMatch) return null;
  const [, dayText, monthText, yearText] = compactMatch;
  return parseMaspoReferenceDate(`MASPO-${dayText}${monthText}${yearText}-1`);
}

function normalizeTime(value = "") {
  const text = String(value || "").trim().toUpperCase();
  const hMatch = text.match(/^([01]\d|2[0-3])([0-5]\d)\s*H$/);
  if (hMatch) return `${hMatch[1]}${hMatch[2]}H`;
  const colonMatch = text.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (colonMatch) return `${pad2(colonMatch[1])}${colonMatch[2]}H`;
  return "";
}

function timeToMinutes(value = "") {
  const normalized = normalizeTime(value);
  if (!normalized) return null;
  return Number(normalized.slice(0, 2)) * 60 + Number(normalized.slice(2, 4));
}

function extractTimeSpan(text = "", fallbackTime = "") {
  const prefixed = [];
  const seenPrefixed = new Set();
  for (const line of String(text).split(/\r?\n/)) {
    const hMatch = line.match(/^\s*(?:[-•*]\s*)?(?:\()?([01]\d|2[0-3])([0-5]\d)\s*H\b/i);
    const colonMatch = line.match(/^\s*(?:[-•*]\s*)?(?:\()?([01]?\d|2[0-3]):([0-5]\d)\b/);
    const match = hMatch || colonMatch;
    if (!match) continue;
    const normalized = `${pad2(match[1])}${match[2]}H`;
    if (!seenPrefixed.has(normalized)) {
      seenPrefixed.add(normalized);
      prefixed.push({ time: normalized, minutes: timeToMinutes(normalized) });
    }
  }

  const entries = prefixed.length ? prefixed : [];
  if (!entries.length) {
    const seen = new Set();
    const timePattern = /\b(?:([01]\d|2[0-3])([0-5]\d)\s*H|([01]?\d|2[0-3]):([0-5]\d))\b/gi;
    for (const match of String(text).matchAll(timePattern)) {
      const normalized = match[1]
        ? `${match[1]}${match[2]}H`
        : `${pad2(match[3])}${match[4]}H`;
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      entries.push({ time: normalized, minutes: timeToMinutes(normalized) });
    }
  }

  const validEntries = entries.filter((entry) => entry.minutes !== null);
  if (!validEntries.length) {
    const fallback = normalizeTime(fallbackTime);
    return {
      startTime: fallback,
      endTime: fallback,
      spansMidnight: false,
    };
  }

  const rolloverIndex = validEntries.findIndex((entry, index) =>
    index > 0 && validEntries[index - 1].minutes - entry.minutes >= 8 * 60,
  );
  if (rolloverIndex >= 0) {
    return {
      startTime: validEntries[0].time,
      endTime: validEntries.at(-1).time,
      spansMidnight: true,
    };
  }

  const chronological = [...validEntries].sort((left, right) => left.minutes - right.minutes);
  return {
    startTime: chronological[0].time,
    endTime: chronological.at(-1).time,
    spansMidnight: false,
  };
}

function getPrimaryRowTime(cells, headerMap = {}) {
  const mapped = headerMap.time !== undefined ? normalizeTime(cells[headerMap.time]) : "";
  if (mapped) return mapped;
  return cells.map(normalizeTime).find(Boolean) || "";
}

function findHeaderMap(rows = []) {
  let best = { score: 0, rowIndex: -1, map: {} };
  rows.slice(0, 40).forEach((row, rowIndex) => {
    const cells = (Array.isArray(row) ? row : []).map(stringifyCell);
    const map = {};
    for (const [key, patterns] of Object.entries(HEADER_ALIASES)) {
      const columnIndex = cells.findIndex((cell) => patterns.some((pattern) => pattern.test(cell)));
      if (columnIndex >= 0) map[key] = columnIndex;
    }
    const score = Object.keys(map).length;
    if (score > best.score) best = { score, rowIndex, map };
  });
  return best.score >= 2 ? best : { score: 0, rowIndex: -1, map: {} };
}

function buildRowDayOffsets(rows, headerMap) {
  let dayOffset = 0;
  let previousMinutes = null;
  let previousReferenceDate = "";
  return rows.map((row) => {
    const cells = (Array.isArray(row) ? row : []).map(stringifyCell);
    const mappedReference = findMappedCell(cells, headerMap, "reference");
    const reference = extractReference(mappedReference) || extractReference(cells.join("\n"));
    const referenceDate = formatDateIso(parseMaspoReferenceDate(reference));
    if (referenceDate && previousReferenceDate && referenceDate !== previousReferenceDate) {
      dayOffset = 0;
      previousMinutes = null;
    }
    if (referenceDate) previousReferenceDate = referenceDate;
    const currentMinutes = timeToMinutes(getPrimaryRowTime(cells, headerMap));
    if (
      previousMinutes !== null &&
      currentMinutes !== null &&
      previousMinutes >= 18 * 60 &&
      currentMinutes <= 6 * 60 &&
      previousMinutes - currentMinutes >= 8 * 60
    ) {
      dayOffset += 1;
    }
    if (currentMinutes !== null) previousMinutes = currentMinutes;
    return dayOffset;
  });
}

function findMappedCell(cells, headerMap, key) {
  const mappedIndex = headerMap[key];
  return mappedIndex === undefined ? "" : stringifyCell(cells[mappedIndex]);
}

function findCategory(cells, headerMap) {
  const mapped = findMappedCell(cells, headerMap, "category");
  if (mapped) return mapped;
  return cells.find((cell) => /\b(?:handover|sign[ -]?in|shunt(?:ing)?|shuting|movement|possession)\b/i.test(cell)) || "";
}

function findSummary(cells, headerMap, reference, category) {
  const mapped = findMappedCell(cells, headerMap, "summary");
  if (mapped) return mapped;
  return [...cells]
    .filter((cell) => cell && cell !== reference && cell !== category)
    .sort((left, right) => right.length - left.length)[0] || "";
}

function extractReference(text = "") {
  const match = String(text).match(MASPO_REFERENCE_PATTERN);
  if (!match) return "";
  return `MASPO-${match[1]}-${match[2].padStart(2, "0")}`;
}

function getTargetLineCandidates(text, trainPattern) {
  let sectionStatus = "";
  const candidates = [];
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/\bcompleted\s+movements?\b/i.test(line)) sectionStatus = "Completed";
    if (/\bpending\s+movements?\b/i.test(line)) sectionStatus = "Pending";
    if (/\b(?:cancelled|canceled)\s+movements?\b/i.test(line)) sectionStatus = "Cancelled";
    if (line && trainPattern.test(line)) {
      candidates.push({ text: line, sectionStatus });
    }
  }
  return candidates;
}

function normalizeEndpoint(value = "") {
  const compact = String(value).toUpperCase().replace(/[().,]/g, "").replace(/\s+/g, "").trim();
  if (!compact) return "";
  if (compact === "TP1") return "G";
  if (/^C0?\d{1,2}$/.test(compact)) return `C${Number(compact.slice(1))}`;
  if (/^T0?\d{1,2}$/.test(compact)) return `T${Number(compact.slice(1))}`;
  if (/^TP0?\d{1,2}$/.test(compact)) return `TP${Number(compact.slice(2))}`;
  if (/^TT0?\d{0,2}$/.test(compact)) {
    const suffix = compact.slice(2);
    return suffix ? `TT${Number(suffix)}` : "TT";
  }
  return compact;
}

export function describeMaspoAreaFlow(from = "", to = "") {
  if (from === "G" && /^C\d+$/i.test(to)) return "Automatic area → Workshop";
  if (/^C\d+$/i.test(from) && to === "G") return "Manual area → Automatic area";
  return "";
}

function findRoute(text, trainPattern) {
  const source = String(text || "").replace(/\bG\s*(?:\/\s*TP\s*0*1|\(\s*TP\s*0*1\s*\))/gi, "G");
  const endpoint = "\\b(TP\\s*0?\\d{1,2}|TT\\s*0?\\d{0,2}|C\\s*0?\\d{1,2}|G)\\b";
  const separator = "(?:TO|→|->|–|—|-)";
  const trainSource = trainPattern.source;
  const afterTrain = new RegExp(`${trainSource}(?:(?!${ANY_TRAIN_SOURCE})[\\s\\S]){0,100}?${endpoint}\\s*${separator}\\s*${endpoint}`, "i");
  const beforeTrain = new RegExp(`${endpoint}\\s*${separator}\\s*${endpoint}(?:(?!${ANY_TRAIN_SOURCE})[\\s\\S]){0,70}?${trainSource}`, "i");
  const general = new RegExp(`${endpoint}\\s*${separator}\\s*${endpoint}`, "i");
  const trainTokens = source.match(new RegExp(ANY_TRAIN_SOURCE, "gi")) || [];
  const match = source.match(afterTrain) || source.match(beforeTrain) || (trainTokens.length <= 1 ? source.match(general) : null);
  if (!match) return { from: "", to: "", route: "" };

  const endpointMatches = match[0].match(new RegExp(endpoint, "gi")) || [];
  if (endpointMatches.length < 2) return { from: "", to: "", route: "" };
  const from = normalizeEndpoint(endpointMatches[endpointMatches.length - 2]);
  const to = normalizeEndpoint(endpointMatches[endpointMatches.length - 1]);
  return {
    from,
    to,
    route: from && to ? `${from} → ${to}` : "",
  };
}

function findPlanStatus(text = "") {
  if (/\bunplanned\b/i.test(text)) return "Unplanned";
  if (/\bplanned\b/i.test(text)) return "Planned";
  return "";
}

function isDetailedMovement(category, text, trainPattern) {
  const faultOnlyCategory = /\b(?:fault|defect|failure|alarm)\b/i.test(category) &&
    !/\b(?:shun?t(?:ing)?|movement)\b/i.test(category);
  if (faultOnlyCategory) return false;
  const categoryHasTrain = trainPattern.test(category);
  const targetCount = String(text).split(/\r?\n/).filter((line) => trainPattern.test(line)).length;
  const hasMovementLanguage = /\b(?:shunt(?:ing)?|shuting|route\s+(?:is\s+)?set|authorized\s+to\s+proceed|movement\s+completed|reported\s+full\s+stop)\b/i.test(text);
  const isHandover = /\b(?:handover|sign[ -]?in)\b/i.test(category);
  return !isHandover && hasMovementLanguage && (categoryHasTrain || targetCount >= 2);
}

function scopeTextToTrain(text, trainPattern) {
  const anyTrainPattern = new RegExp(ANY_TRAIN_SOURCE, "i");
  return String(text)
    .split(/\r?\n/)
    .filter((line) => !anyTrainPattern.test(line) || trainPattern.test(line))
    .join("\n");
}

function detectMovementStatus({ category, text, trainPattern, detailed, sectionStatus = "" }) {
  if (sectionStatus) return sectionStatus;
  const scopedText = scopeTextToTrain(text, trainPattern);
  if (/\b(?:cancelled|canceled)\b/i.test(scopedText) && trainPattern.test(scopedText)) return "Cancelled";
  if (/\bmovement\s+(?:successfully\s+)?completed\b/i.test(scopedText)) return "Completed";
  if (/\bcompleted\s+(?:for\s+)?(?:TS|TR|T)?\s*0*\d+\b/i.test(scopedText)) return "Completed";
  if (
    detailed &&
    /\breported\s+(?:a\s+)?full\s+stop\b/i.test(scopedText) &&
    /\b(?:power|third\s+rail)[\s\S]{0,80}\b(?:switched|switch)\s+off\b/i.test(scopedText)
  ) {
    return "Completed";
  }
  if (
    detailed &&
    /\b(?:parked|arrived|complete\s+stop)\b/i.test(scopedText) &&
    /\b(?:SCD\s+(?:is\s+)?removed|area\s+(?:is\s+)?clear|handover\s+train\s+to\s+DC)\b/i.test(scopedText)
  ) {
    return "Completed";
  }
  if (/\bpending\b/i.test(scopedText)) return "Pending";
  if (detailed || /\bmovement\b/i.test(category)) return "Movement logged";
  return "Recorded";
}

function buildSortKey(date, time, rowNumber, sourceIndex, candidateIndex = 0) {
  const dateMs = date instanceof Date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
  const minutes = timeToMinutes(time) ?? 0;
  return dateMs + minutes * 60_000 + rowNumber * 100 + candidateIndex * 2 + sourceIndex / 1000;
}

function routesMatch(left, right) {
  return Boolean(left?.from && left?.to && left.from === right?.from && left.to === right?.to);
}

export function isSupportedMaspoSpreadsheet(name = "") {
  return EXCEL_FILE_PATTERN.test(String(name));
}

export function normalizeMaspoTrainQuery(value = "") {
  const digits = String(value || "").match(/\d{1,3}/)?.[0] || "";
  if (!digits) return null;
  const number = Number(digits);
  if (!Number.isInteger(number) || number < 1 || number > 999) return null;
  return {
    number,
    digits: String(number),
    label: `T${String(number).padStart(2, "0")}`,
  };
}

export function buildMaspoTrainPattern(trainQuery) {
  const normalized = typeof trainQuery === "object" ? trainQuery : normalizeMaspoTrainQuery(trainQuery);
  if (!normalized) return null;
  return new RegExp(`\\b(?:TRAIN\\s*SET|TS|TR|T)\\s*[-–—]?\\s*0*${escapeRegExp(normalized.digits)}\\b`, "i");
}

export function scanMaspoSheetRows({
  fileName = "",
  sheetName = "",
  rows = [],
  trainQuery = "",
  sourceIndex = 0,
} = {}) {
  const normalizedTrain = normalizeMaspoTrainQuery(trainQuery);
  const trainPattern = buildMaspoTrainPattern(normalizedTrain);
  if (!normalizedTrain || !trainPattern || !Array.isArray(rows)) return [];

  const { map: headerMap } = findHeaderMap(rows);
  const dayOffsets = buildRowDayOffsets(rows, headerMap);
  const fallbackFileDate = parseFileDate(fileName);
  const records = [];

  rows.forEach((row, rowIndex) => {
    const cells = (Array.isArray(row) ? row : []).map(stringifyCell);
    const rowText = cells.filter(Boolean).join("\n");
    if (!rowText || !trainPattern.test(rowText)) return;

    const mappedReference = extractReference(findMappedCell(cells, headerMap, "reference"));
    const reference = mappedReference || extractReference(rowText);
    if (!reference) return;

    const category = findCategory(cells, headerMap);
    const summary = findSummary(cells, headerMap, reference, category);
    const categoryHasNamedTrain = new RegExp(ANY_TRAIN_SOURCE, "i").test(category);
    if (categoryHasNamedTrain && !trainPattern.test(category)) return;
    const combinedText = `${category}\n${summary}`;
    const detailed = isDetailedMovement(category, combinedText, trainPattern);
    const summaryCandidates = getTargetLineCandidates(summary, trainPattern);
    const categoryCandidates = getTargetLineCandidates(category, trainPattern);
    const targetLines = [...categoryCandidates, ...summaryCandidates].map((candidate) => candidate.text);
    const candidates = detailed
      ? [{ text: targetLines.join("\n") || combinedText, sectionStatus: "" }]
      : (summaryCandidates.length ? summaryCandidates : categoryCandidates);
    if (!candidates.length) return;

    const recordTime = getPrimaryRowTime(cells, headerMap);
    const detailSpan = detailed
      ? extractTimeSpan(combinedText, recordTime)
      : { startTime: recordTime, endTime: recordTime, spansMidnight: false };
    const referenceDate = parseMaspoReferenceDate(reference) || fallbackFileDate;
    const rowOperationalDate = referenceDate ? addUtcDays(referenceDate, dayOffsets[rowIndex] || 0) : null;
    const recordMinutes = timeToMinutes(recordTime);
    const movementDate = detailSpan.spansMidnight && rowOperationalDate && recordMinutes !== null && recordMinutes <= 6 * 60
      ? addUtcDays(rowOperationalDate, -1)
      : rowOperationalDate;
    const endOperationalDate = detailSpan.spansMidnight && movementDate
      ? addUtcDays(movementDate, 1)
      : movementDate;
    const date = formatDateIso(movementDate);
    const endDate = formatDateIso(endOperationalDate);
    const dateDisplay = formatDateDisplay(date);
    const endDateDisplay = formatDateDisplay(endDate);
    const dateRangeDisplay = detailSpan.spansMidnight && dateDisplay && endDateDisplay
      ? `${dateDisplay}–${endDateDisplay}`
      : dateDisplay;
    const location = findMappedCell(cells, headerMap, "location");

    candidates.forEach((candidate, candidateIndex) => {
      const candidateText = String(candidate.text || "");
      const routeText = detailed ? combinedText : candidateText;
      const route = findRoute(routeText, trainPattern);
      const faultOnlyCategory = /\b(?:fault|defect|failure|alarm)\b/i.test(category) &&
        !/\b(?:shun?t(?:ing)?|movement)\b/i.test(category);
      const categoryMovementEvidence = !faultOnlyCategory &&
        trainPattern.test(category) &&
        /\b(?:shun?t(?:ing)?|movement)\b/i.test(category);
      const targetMovementEvidence = /\b(?:planned|unplanned)\s+movement\b|\b(?:pending|completed|cancelled|canceled)\s+movements?\b|\bmovement\s+(?:pending|completed|cancelled|canceled)\b|\bshun?t(?:ing)?\b|\broute\s+(?:set|confirmed)\b/i.test(candidateText);
      if (!detailed && !candidate.sectionStatus && !categoryMovementEvidence && !targetMovementEvidence) return;

      const status = detectMovementStatus({
        category,
        text: detailed ? combinedText : candidateText,
        trainPattern,
        detailed,
        sectionStatus: candidate.sectionStatus,
      });
      const planStatus = findPlanStatus(`${detailed ? combinedText : candidateText}\n${category}`);
      const { startTime, endTime, spansMidnight } = detailSpan;

      records.push({
        id: `${fileName}:${sheetName}:${rowIndex + 1}:${candidateIndex}:${reference}`,
        train: normalizedTrain.label,
        trainNumber: normalizedTrain.number,
        reference,
        fileName,
        sheetName,
        rowNumber: rowIndex + 1,
        sourceIndex,
        candidateIndex,
        location,
        category,
        status,
        planStatus,
        detailed,
        from: route.from,
        to: route.to,
        route: route.route,
        areaDetail: describeMaspoAreaFlow(route.from, route.to),
        date,
        endDate,
        dateDisplay,
        endDateDisplay,
        dateRangeDisplay,
        recordTime,
        startTime,
        endTime,
        spansMidnight,
        timeRange: startTime && endTime && startTime !== endTime ? `${startTime}–${endTime}` : (startTime || endTime),
        sortKey: buildSortKey(rowOperationalDate, recordTime || startTime, rowIndex + 1, sourceIndex, candidateIndex),
      });
    });
  });

  return records;
}

export function analyzeMaspoMovementSources(sources = [], trainQuery = "") {
  const normalizedTrain = normalizeMaspoTrainQuery(trainQuery);
  if (!normalizedTrain) throw new Error("Enter a valid train set, such as 07 or TS07.");

  const allRecords = [];
  let sheetsScanned = 0;
  const filesScanned = new Set();

  (Array.isArray(sources) ? sources : []).forEach((source, sourceIndex) => {
    const fileName = String(source?.fileName || `Workbook ${sourceIndex + 1}`);
    filesScanned.add(fileName);
    (Array.isArray(source?.sheets) ? source.sheets : []).forEach((sheet) => {
      sheetsScanned += 1;
      allRecords.push(...scanMaspoSheetRows({
        fileName,
        sheetName: String(sheet?.sheetName || sheet?.name || "Sheet"),
        rows: Array.isArray(sheet?.rows) ? sheet.rows : [],
        trainQuery: normalizedTrain.label,
        sourceIndex,
      }));
    });
  });

  const compareRecords = (left, right) =>
    left.sortKey - right.sortKey ||
    left.rowNumber - right.rowNumber ||
    left.candidateIndex - right.candidateIndex ||
    left.sourceIndex - right.sourceIndex;
  const sortedRecords = allRecords.sort(compareRecords);
  const seenRecords = new Set();
  const records = sortedRecords.filter((record) => {
    const dedupeKey = [
      record.reference,
      record.trainNumber,
      record.from,
      record.to,
      record.detailed ? "detailed" : "summary",
      record.status,
      record.planStatus,
      record.timeRange,
    ].join("|");
    if (seenRecords.has(dedupeKey)) return false;
    seenRecords.add(dedupeKey);
    return true;
  });
  const detailedRecords = records.filter((record) => record.detailed);
  const summaryRecords = records.filter((record) => !record.detailed);
  const corroborationWindowMs = 36 * 60 * 60 * 1000;
  const unmatchedSummaryRecords = summaryRecords.filter((summaryRecord) => {
    if (!detailedRecords.length) return true;
    return !detailedRecords.some((detailRecord) => {
      if (!routesMatch(summaryRecord, detailRecord)) return false;
      const delta = detailRecord.sortKey - summaryRecord.sortKey;
      if (summaryRecord.status === "Pending") {
        return delta >= 0 && delta <= corroborationWindowMs;
      }
      if (summaryRecord.status === "Completed") {
        return delta <= 0 && Math.abs(delta) <= corroborationWindowMs;
      }
      return Math.abs(delta) <= corroborationWindowMs;
    });
  });
  const timelineRecords = [...detailedRecords, ...unmatchedSummaryRecords]
    .sort(compareRecords);
  const completionCandidates = records.filter((record) => !record.detailed && record.status === "Completed");
  const corroboratedDetails = new Set();
  completionCandidates.forEach((completion) => {
    const closestDetail = detailedRecords
      .filter((detail) =>
        detail.status !== "Completed" &&
        !corroboratedDetails.has(detail.id) &&
        completion.sortKey >= detail.sortKey &&
        completion.sortKey - detail.sortKey <= corroborationWindowMs &&
        routesMatch(completion, detail),
      )
      .sort((left, right) => right.sortKey - left.sortKey)[0];
    if (closestDetail) corroboratedDetails.add(closestDetail.id);
  });
  const timeline = timelineRecords.map((record) => {
    return corroboratedDetails.has(record.id) ? { ...record, status: "Completed" } : record;
  });
  const latest = records.at(-1) || null;

  return {
    train: normalizedTrain.label,
    trainNumber: normalizedTrain.number,
    filesScanned: filesScanned.size,
    sheetsScanned,
    records,
    timeline,
    latest,
    matchCount: records.length,
  };
}

export function formatMaspoMovementSummary(analysis = {}) {
  const train = analysis.train || "Train";
  const timeline = Array.isArray(analysis.timeline) ? analysis.timeline : [];
  const latest = analysis.latest || null;
  const lines = [`${train} movement check`];

  if (!timeline.length) {
    lines.push("No matching MASPO movement record was found in the uploaded Excel files.");
    return lines.join("\n");
  }

  timeline.forEach((record) => {
    const route = record.route || "Route not stated";
    const areaDetail = record.areaDetail || describeMaspoAreaFlow(record.from, record.to);
    const area = areaDetail ? ` — ${areaDetail}` : "";
    const status = record.status || "Recorded";
    const plan = record.planStatus ? ` (${record.planStatus})` : "";
    const displayDate = record.dateRangeDisplay || record.dateDisplay || "";
    const date = displayDate ? `${displayDate}, ` : "";
    const time = record.timeRange ? `${date}${record.timeRange}` : (displayDate || "Time not stated");
    lines.push(`- ${route}${area} — ${status}${plan} — ${time} — Ref: ${record.reference}`);
  });

  if (latest) {
    const latestRoute = latest.route ? `, ${latest.route}` : "";
    const latestAreaDetail = latest.areaDetail || describeMaspoAreaFlow(latest.from, latest.to);
    const latestArea = latestAreaDetail ? ` — ${latestAreaDetail}` : "";
    lines.push(`Latest status: ${latest.status || "Recorded"}${latestRoute}${latestArea} — Ref: ${latest.reference}`);
  }

  return lines.join("\n");
}

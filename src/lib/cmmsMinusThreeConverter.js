const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const DAY_MS = 24 * 60 * 60 * 1000;

function pad2(value) {
  return String(value).padStart(2, "0");
}

function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function dateTextToUtcMs(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const numeric = Number(text);
  if (Number.isFinite(numeric) && numeric > 1) {
    return EXCEL_EPOCH_UTC + Math.round(numeric * DAY_MS);
  }

  const isoMatch = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?/i);
  if (isoMatch) {
    return Date.UTC(
      Number(isoMatch[1]),
      Number(isoMatch[2]) - 1,
      Number(isoMatch[3]),
      Number(isoMatch[4]),
      Number(isoMatch[5]),
      Number(isoMatch[6] || 0),
    );
  }

  const cmmsMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!cmmsMatch) return null;

  const month = Number(cmmsMatch[1]);
  const day = Number(cmmsMatch[2]);
  const yearRaw = Number(cmmsMatch[3]);
  const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
  let hour = Number(cmmsMatch[4]);
  const meridiem = String(cmmsMatch[7] || "").toUpperCase();
  if (meridiem === "AM" && hour === 12) hour = 0;
  if (meridiem === "PM" && hour < 12) hour += 12;

  return Date.UTC(year, month - 1, day, hour, Number(cmmsMatch[5]), Number(cmmsMatch[6] || 0));
}

export function cmmsDateValueToUtcMs(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return Date.UTC(
      value.getFullYear(),
      value.getMonth(),
      value.getDate(),
      value.getHours(),
      value.getMinutes(),
      value.getSeconds(),
    );
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return EXCEL_EPOCH_UTC + Math.round(value * DAY_MS);
  }

  return dateTextToUtcMs(value);
}

export function formatCmmsDateTimeText(value, minuteDelta = 0) {
  const timestamp = cmmsDateValueToUtcMs(value);
  if (!Number.isFinite(timestamp)) return "";
  const date = new Date(timestamp + minuteDelta * 60 * 1000);
  return `${pad2(date.getUTCDate())}-${pad2(date.getUTCMonth() + 1)}-${date.getUTCFullYear()} ${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())}`;
}

export function formatCmmsMinusThreeText(value) {
  return formatCmmsAdjustedText(value, 3);
}

export function normalizeCmmsDeductionMinutes(value) {
  return Number(value) === 2 ? 2 : 3;
}

export function formatCmmsAdjustedText(value, deductionMinutes = 3) {
  return formatCmmsDateTimeText(value, -normalizeCmmsDeductionMinutes(deductionMinutes));
}

export function normalizeCmmsTrainId(value) {
  const match = String(value ?? "").trim().match(/(\d{1,3})$/);
  if (!match) return "";
  const trainNumber = Number(match[1]) % 100;
  if (!Number.isInteger(trainNumber) || trainNumber < 1 || trainNumber > 99) return "";
  return pad2(trainNumber);
}

export function parseCmmsMaintenanceTrainIds(value) {
  const seen = new Set();
  return String(value ?? "")
    .split(/[\s,;]+/)
    .map(normalizeCmmsTrainId)
    .filter((trainId) => {
      if (!trainId || seen.has(trainId)) return false;
      seen.add(trainId);
      return true;
    });
}

export function matchCmmsMaintenanceRows(rows, trainIds) {
  const requestedIds = [...new Set((Array.isArray(trainIds) ? trainIds : []).map(normalizeCmmsTrainId).filter(Boolean))];
  const requestedIdSet = new Set(requestedIds);
  const matchedRows = (Array.isArray(rows) ? rows : []).filter((row) => requestedIdSet.has(normalizeCmmsTrainId(row.trainNumber)));
  const matchedIdSet = new Set(matchedRows.map((row) => normalizeCmmsTrainId(row.trainNumber)));
  return {
    matchedRows,
    unmatchedIds: requestedIds.filter((trainId) => !matchedIdSet.has(trainId)),
  };
}

export function parseCmmsMinusThreeMatrix(matrix) {
  const rows = Array.isArray(matrix) ? matrix : [];
  const headerIndex = rows.findIndex((row, index) => {
    if (index > 9 || !Array.isArray(row)) return false;
    const headers = row.map(normalizeHeader);
    return headers.includes("train number") && headers.includes("description") && headers.includes("next wash");
  });

  if (headerIndex < 0) {
    throw new Error('The Excel file must contain "Train Number", "Description", and "Next Wash" columns.');
  }

  const headers = rows[headerIndex].map(normalizeHeader);
  const trainIndex = headers.indexOf("train number");
  const descriptionIndex = headers.indexOf("description");
  const nextWashIndex = headers.indexOf("next wash");
  const trainLocationIndex = headers.indexOf("train location");

  return rows
    .slice(headerIndex + 1)
    .map((row, offset) => {
      const trainNumber = String(row?.[trainIndex] ?? "").trim();
      const description = String(row?.[descriptionIndex] ?? "").trim();
      const trainLocation = trainLocationIndex >= 0 ? String(row?.[trainLocationIndex] ?? "").trim() : "";
      const nextWashValue = row?.[nextWashIndex];
      const nextWashText = formatCmmsDateTimeText(nextWashValue);
      const outputText = formatCmmsMinusThreeText(nextWashValue);
      if (!trainNumber || !nextWashText || !outputText) return null;
      return {
        id: `${headerIndex + offset + 2}-${trainNumber}`,
        trainNumber,
        description,
        trainLocation,
        isMaintenance: /\bmaint(?:enance)?\b/i.test(trainLocation),
        nextWashValue,
        nextWashText,
        outputText,
      };
    })
    .filter(Boolean);
}

export function findCmmsMinusThreeRows(workbook, xlsx) {
  for (const sheetName of workbook?.SheetNames || []) {
    const sheet = workbook.Sheets?.[sheetName];
    if (!sheet) continue;
    const matrix = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
    try {
      const rows = parseCmmsMinusThreeMatrix(matrix);
      if (rows.length) return { sheetName, rows };
    } catch {
      // Continue scanning other sheets because CMMS exports can include a cover sheet.
    }
  }

  throw new Error('No valid CMMS washing rows were found. Check the "Next Wash" column.');
}

export function createCmmsMinusThreeWorkbook(rows, xlsx, deductionMinutes = 3) {
  const normalizedDeduction = normalizeCmmsDeductionMinutes(deductionMinutes);
  const data = [
    ["Train Number", "Description", "Next Wash", `OUTPUT –${normalizedDeduction} Time`],
    ...rows.map((row) => [
      row.trainNumber,
      row.description,
      row.nextWashValue,
      formatCmmsAdjustedText(row.nextWashValue, normalizedDeduction),
    ]),
  ];
  const sheet = xlsx.utils.aoa_to_sheet(data);
  sheet["!cols"] = [{ wch: 18 }, { wch: 23 }, { wch: 22 }, { wch: 24 }];
  sheet["!autofilter"] = { ref: sheet["!ref"] };

  rows.forEach((row, index) => {
    const excelRow = index + 2;
    const nextWashCell = sheet[`C${excelRow}`];
    const outputCell = sheet[`D${excelRow}`];
    if (nextWashCell && typeof row.nextWashValue === "number") {
      nextWashCell.t = "n";
      nextWashCell.z = "m/d/yy h:mm AM/PM";
    }
    if (outputCell) {
      const outputText = formatCmmsAdjustedText(row.nextWashValue, normalizedDeduction);
      outputCell.t = "s";
      outputCell.z = "@";
      outputCell.v = outputText;
      outputCell.w = outputText;
    }
  });

  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, sheet, "List of Train Wash Record");
  return workbook;
}

export function buildCmmsMinusThreeFileName(fileName) {
  const baseName = String(fileName || "cmms-wash")
    .replace(/\.(xlsx|xls)$/i, "")
    .replace(/[–-]OUTPUT$/i, "")
    .trim() || "cmms-wash";
  return `${baseName}–OUTPUT.xlsx`;
}

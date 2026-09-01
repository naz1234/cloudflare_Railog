import { normalizeSleepModeLogs, normalizeSleepTrainId } from "./sleepModeLog.js";
import { strToU8, zipSync } from "fflate";

const SHIFT_DEFINITIONS = {
  night: {
    title: "NIGHT SHIFT (Sleep Mode)",
    startColumn: 0,
    headers: [
      "Train set",
      "Date",
      "Location",
      "Sleep Time\nNight Shift",
      "Wake Up Time",
      "Alarms Observation\nSleep Mode Alarm",
    ],
    columns: { train: 0, date: 1, location: 2, sleep: 3, wake: 4, remark: 5 },
    fill: "ED7D31",
    titleFont: "FFFFFF",
  },
  early: {
    title: "Early Shift (Sleep Mode)",
    startColumn: 6,
    headers: [
      "Train set",
      "Date",
      "SLEEP Mode\nStarted",
      "Wake Up Time",
      "Alarms Observation\nStandby Mode Alarm",
    ],
    columns: { train: 6, date: 7, sleep: 8, wake: 9, remark: 10 },
    fill: "FFFF00",
    titleFont: "000000",
  },
  late: {
    title: "LATE Shift (Sleep Mode)",
    startColumn: 11,
    headers: [
      "Train set",
      "Date",
      "SLEEP Mode\nStarted",
      "Wake Up Time",
      "Alarms Observation\nStandby Mode Alarm",
    ],
    columns: { train: 11, date: 12, sleep: 13, wake: 14, remark: 15 },
    fill: "4472C4",
    titleFont: "FFFFFF",
  },
};

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseLogDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function compareLogEvents(left, right) {
  const leftMs = parseLogDate(left.createdAt)?.getTime() ?? Number.POSITIVE_INFINITY;
  const rightMs = parseLogDate(right.createdAt)?.getTime() ?? Number.POSITIVE_INFINITY;
  if (leftMs !== rightMs) return leftMs - rightMs;
  if (left.time !== right.time) return left.time.localeCompare(right.time);
  return left.sourceIndex - right.sourceIndex;
}

function uniqueRemarks(events = []) {
  const seen = new Set();
  return events
    .map((event) => String(event?.remark || "").trim())
    .filter((remark) => {
      const key = remark.toLowerCase();
      if (!remark || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(" / ");
}

export function getSleepExcelShift(time = "") {
  const match = String(time || "").match(/^(\d{2}):(\d{2})$/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return "";
  if (hour >= 23 || hour < 7) return "night";
  if (hour < 15) return "early";
  return "late";
}

export function formatSleepExcelDate(value) {
  const date = parseLogDate(value);
  if (!date) return "";
  return `${String(date.getDate()).padStart(2, "0")}-${MONTH_LABELS[date.getMonth()]}-${date.getFullYear()}`;
}

export function formatSleepExcelLocation(value = "") {
  const clean = String(value || "").trim().toUpperCase();
  const match = clean.match(/(?:WD|ED)-ST(\d{2})/);
  return match ? `Stabling ${match[1]}` : clean.replace(/-/g, " ");
}

export function formatSleepExcelTime(value = "") {
  return /^\d{2}:\d{2}$/.test(String(value || "")) ? `${value} hrs` : "";
}

export function summarizeSleepLogsForExcel(logs = []) {
  const groups = new Map();

  normalizeSleepModeLogs(logs).forEach((entry, sourceIndex) => {
    const shift = getSleepExcelShift(entry.time);
    if (!shift) return;
    entry.trainIds.forEach((rawTrainId) => {
      const trainId = normalizeSleepTrainId(rawTrainId);
      if (!trainId) return;
      const key = `${shift}:${trainId}`;
      if (!groups.has(key)) groups.set(key, { shift, trainId, sleepEvents: [], wakeEvents: [] });
      groups.get(key)[entry.mode === "wake" ? "wakeEvents" : "sleepEvents"].push({ ...entry, sourceIndex });
    });
  });

  return Array.from(groups.values())
    .map((group) => {
      const sleepEvents = group.sleepEvents.sort(compareLogEvents);
      const wakeEvents = group.wakeEvents.sort(compareLogEvents);
      const firstSleep = sleepEvents[0] || null;
      const lastWake = wakeEvents[wakeEvents.length - 1] || null;
      const anchor = firstSleep || lastWake;
      return {
        shift: group.shift,
        trainId: group.trainId,
        date: formatSleepExcelDate(anchor?.createdAt),
        location: formatSleepExcelLocation(anchor?.location),
        sleepTime: formatSleepExcelTime(firstSleep?.time),
        wakeTime: formatSleepExcelTime(lastWake?.time),
        remark: uniqueRemarks([firstSleep, lastWake]),
      };
    })
    .sort((left, right) => Number(left.trainId) - Number(right.trainId)
      || left.shift.localeCompare(right.shift));
}

function buildSleepModeRows(logs = []) {
  const rows = Array.from({ length: 50 }, () => Array(16).fill(""));
  Object.values(SHIFT_DEFINITIONS).forEach((shift) => {
    rows[1][shift.startColumn] = shift.title;
    shift.headers.forEach((header, index) => { rows[2][shift.startColumn + index] = header; });
    for (let trainNumber = 1; trainNumber <= 47; trainNumber += 1) {
      rows[trainNumber + 2][shift.columns.train] = `T${String(trainNumber).padStart(2, "0")}`;
    }
  });

  summarizeSleepLogsForExcel(logs).forEach((entry) => {
    const shift = SHIFT_DEFINITIONS[entry.shift];
    if (!shift) return;
    const row = Number(entry.trainId) + 2;
    rows[row][shift.columns.date] = entry.date;
    if (shift.columns.location !== undefined) rows[row][shift.columns.location] = entry.location;
    rows[row][shift.columns.sleep] = entry.sleepTime;
    rows[row][shift.columns.wake] = entry.wakeTime;
    rows[row][shift.columns.remark] = entry.remark;
  });
  return rows;
}

function escapeXml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getColumnName(index) {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function getCellStyle(row, column) {
  if (row === 1) {
    if (column <= 5) return 1;
    if (column <= 10) return 3;
    return 5;
  }
  if (row === 2) {
    if (column <= 5) return 2;
    if (column <= 10) return 4;
    return 6;
  }
  return [5, 10, 15].includes(column) ? 8 : 7;
}

function buildWorksheetXml(logs = []) {
  const rows = buildSleepModeRows(logs);
  const columnWidths = [
    12, 17, 13.43, 13.14, 19.57, 68.14,
    14.43, 15, 10, 10, 48.43,
    14.43, 15, 10, 10, 50,
  ];
  const columnsXml = columnWidths
    .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
    .join("");
  const rowsXml = rows.slice(1).map((values, offset) => {
    const row = offset + 1;
    const rowNumber = row + 1;
    const height = row === 1 ? 24 : row === 2 ? 57 : 15;
    const cells = values.map((value, column) => {
      const reference = `${getColumnName(column)}${rowNumber}`;
      return `<c r="${reference}" s="${getCellStyle(row, column)}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowNumber}" ht="${height}" customHeight="1">${cells}</row>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A2:P50"/>
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>${columnsXml}</cols>
  <sheetData>${rowsXml}</sheetData>
  <mergeCells count="3"><mergeCell ref="A2:F2"/><mergeCell ref="G2:K2"/><mergeCell ref="L2:P2"/></mergeCells>
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="5">
    <font><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="14"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="14"/><color rgb="FF000000"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="5">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFED7D31"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF4472C4"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="9">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

export function createSleepModeExcelBytes(logs = []) {
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;
  const packageRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Sleep &amp; Stdby Mode" sheetId="1" r:id="rId1"/></sheets>
  <calcPr calcId="191029"/>
</workbook>`;
  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  return zipSync({
    "[Content_Types].xml": strToU8(contentTypesXml),
    "_rels/.rels": strToU8(packageRelsXml),
    "xl/workbook.xml": strToU8(workbookXml),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRelsXml),
    "xl/worksheets/sheet1.xml": strToU8(buildWorksheetXml(logs)),
    "xl/styles.xml": strToU8(STYLES_XML),
  }, { level: 6 });
}

export function buildSleepModeExcelFileName(logs = [], now = new Date(), depotLabel = "") {
  const newestLogDate = normalizeSleepModeLogs(logs)
    .map((entry) => parseLogDate(entry.createdAt))
    .filter(Boolean)
    .sort((left, right) => right.getTime() - left.getTime())[0];
  const date = newestLogDate || parseLogDate(now) || new Date();
  const datePart = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const cleanDepotLabel = String(depotLabel || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-");
  return `SLP-${cleanDepotLabel ? `${cleanDepotLabel}-` : ""}Sleep-Mode-${datePart}.xlsx`;
}

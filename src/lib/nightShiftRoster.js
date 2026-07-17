const TARGET_STAFF_ID = "1000335";
const TARGET_STAFF_PATTERN = /\bbin\s+jaafar\b/i;
const ROSTER_CODE_PATTERN = /\b(?:N3-DC|NRDOT|L3-DC|E3-DC|WR|RDOT|OFF)\b/i;
const DATE_HEADER_PATTERN = /^(\d{1,2})[./-](\d{1,2})[./-]?$/;
const ROSTER_RANGE_PATTERN = /\bFor\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+To\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/i;
const ROW_TOLERANCE = 2.5;
const STAFF_ROW_DISTANCE = 32;

function normalizeYear(value) {
  const year = Number(value);
  if (!Number.isFinite(year)) return null;
  return year < 100 ? 2000 + year : year;
}

function getIsoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseRosterRange(items = []) {
  const text = items.map((item) => item.str).join(" ");
  const match = text.match(ROSTER_RANGE_PATTERN);
  if (!match) return null;

  const startYear = normalizeYear(match[3]);
  const endYear = normalizeYear(match[6]);
  if (!startYear || !endYear) return null;

  return {
    start: {
      day: Number(match[1]),
      month: Number(match[2]),
      year: startYear,
    },
    end: {
      day: Number(match[4]),
      month: Number(match[5]),
      year: endYear,
    },
  };
}

function groupItemsByRow(items = [], tolerance = ROW_TOLERANCE) {
  const rows = [];

  [...items]
    .filter((item) => item.str)
    .sort((left, right) => right.y - left.y || left.x - right.x)
    .forEach((item) => {
      const row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= tolerance);
      if (row) {
        row.items.push(item);
        row.y = row.items.reduce((total, current) => total + current.y, 0) / row.items.length;
      } else {
        rows.push({ y: item.y, items: [item] });
      }
    });

  rows.forEach((row) => row.items.sort((left, right) => left.x - right.x));
  return rows;
}

function getRowText(row) {
  return row.items.map((item) => item.str).join(" ");
}

function rowHasTargetStaffId(row) {
  return row.items.some((item) => String(item.str || "").replace(/\D/g, "") === TARGET_STAFF_ID)
    || getRowText(row).replace(/\D/g, "").includes(TARGET_STAFF_ID);
}

function getTargetShiftRows(items = []) {
  const rows = groupItemsByRow(items);
  const staffIdRows = rows.filter(rowHasTargetStaffId);
  const nameRows = rows.filter((row) => TARGET_STAFF_PATTERN.test(getRowText(row)));
  const shiftRows = rows.filter((row) => ROSTER_CODE_PATTERN.test(getRowText(row)));
  const targetRows = [];

  const getNearestRow = (candidates, staffIdRow) => candidates
    .map((row) => ({ row, distance: Math.abs(row.y - staffIdRow.y) }))
    .filter(({ distance }) => distance <= STAFF_ROW_DISTANCE)
    .sort((left, right) => left.distance - right.distance)[0]?.row;

  staffIdRows.forEach((staffIdRow) => {
    const nearestRow = getNearestRow(nameRows, staffIdRow)
      || getNearestRow(shiftRows, staffIdRow);

    if (nearestRow) targetRows.push(nearestRow);
  });

  return {
    staffFound: staffIdRows.length > 0,
    rows: Array.from(new Set(targetRows)),
  };
}

function getDateHeaders(items = [], rosterRange, fallbackYear) {
  const headerRows = groupItemsByRow(
    items.filter((item) => DATE_HEADER_PATTERN.test(item.str)),
    1.5
  );
  const headerRow = headerRows.sort((left, right) => right.items.length - left.items.length)[0];
  if (!headerRow || headerRow.items.length < 2) return [];

  let year = rosterRange?.start?.year || Number(fallbackYear) || new Date().getFullYear();
  let previousMonth = rosterRange?.start?.month || null;

  return headerRow.items
    .map((item) => {
      const match = item.str.match(DATE_HEADER_PATTERN);
      if (!match) return null;
      const day = Number(match[1]);
      const month = Number(match[2]);

      if (previousMonth && month < previousMonth && previousMonth - month >= 6) {
        year += 1;
      }
      previousMonth = month;

      return {
        x: item.x,
        day,
        month,
        year,
        date: getIsoDate(year, month, day),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.x - right.x);
}

function getCellCode(rowItems, headers, index) {
  const header = headers[index];
  const previous = headers[index - 1];
  const next = headers[index + 1];
  const leftBoundary = previous ? (previous.x + header.x) / 2 : header.x - 14;
  const rightBoundary = next ? (header.x + next.x) / 2 : header.x + 24;

  return rowItems
    .filter((item) => item.x >= leftBoundary && item.x < rightBoundary)
    .map((item) => item.str)
    .join("")
    .replace(/\s+/g, "")
    .toUpperCase();
}

export function parseBinJaafarRoster(pages = [], fallbackYear = new Date().getFullYear()) {
  const entries = [];
  const coveredDates = [];
  let staffFound = false;
  let dateHeadersFound = false;
  let rosterRange = null;

  pages.forEach((pageItems = [], pageIndex) => {
    const pageRange = parseRosterRange(pageItems);
    rosterRange ||= pageRange;
    const headers = getDateHeaders(pageItems, pageRange || rosterRange, fallbackYear);
    if (headers.length) {
      dateHeadersFound = true;
      coveredDates.push(...headers.map((header) => header.date));
    }

    const target = getTargetShiftRows(pageItems);
    const targetRows = target.rows;
    if (target.staffFound) staffFound = true;

    targetRows.forEach((row) => {
      headers.forEach((header, index) => {
        const code = getCellCode(row.items, headers, index);
        let type = null;
        if (code.includes("N3-DC")) type = "N3-DC";
        else if (code.includes("NRDOT")) type = "NRDOT";
        if (!type) return;

        entries.push({
          date: header.date,
          year: header.year,
          month: header.month,
          day: header.day,
          code: type,
          page: pageIndex + 1,
        });
      });
    });
  });

  const uniqueEntries = Array.from(
    new Map(entries.map((entry) => [`${entry.date}-${entry.code}`, entry])).values()
  ).sort((left, right) => left.date.localeCompare(right.date));

  return {
    staffName: "Bin Jaafar",
    staffId: TARGET_STAFF_ID,
    staffFound,
    dateHeadersFound,
    rosterRange,
    coveredDates: Array.from(new Set(coveredDates)).sort(),
    entries: uniqueEntries,
  };
}

export function summarizeBinJaafarNightShifts(parsedRoster, selectedYear, selectedMonth) {
  const year = Number(selectedYear);
  const month = Number(selectedMonth) + 1;
  const entries = (parsedRoster?.entries || []).filter((entry) => (
    entry.year === year && entry.month === month
  ));
  const periodPrefix = `${year}-${String(month).padStart(2, "0")}-`;
  const periodFound = (parsedRoster?.coveredDates || []).some((date) => date.startsWith(periodPrefix));
  const regularEntries = entries.filter((entry) => entry.code === "N3-DC");
  const rdotEntries = entries.filter((entry) => entry.code === "NRDOT");

  return {
    periodFound,
    entries,
    regularEntries,
    rdotEntries,
    regularCount: regularEntries.length,
    rdotCount: rdotEntries.length,
    totalCount: entries.length,
  };
}

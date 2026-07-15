const DATE_TOKEN_RE = /^\d{2}\.\d{2}\.$/;
const PREFIX_RE = /^L3-DEP-(DM|TCC|TC|DC|EFC|SC)\s*\d*$/i;
const PERSONNEL_BOUNDARY_PREFIX_RE = /^L(?:3|3465)-DEP-(DM|TCC|TC|DC|EFC|SC)\s*\d*$/i;
const TIME_RANGE_RE = /(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/;

export const ROSTER_ROLE_ORDER = ["DM", "TCC", "TC", "DC", "EFC", "SC"];
export const ROSTER_PARSER_VERSION = 10;

const EXCLUDED_ROSTER_PERSONNEL = [
  { personnelId: "1000351", canonicalName: "ARAB, A." },
];

function isExcludedRosterPerson(rawName = "", personnelId = "") {
  const normalizedName = canonicalPersonName(rawName);
  const normalizedId = String(personnelId || "").trim();
  return EXCLUDED_ROSTER_PERSONNEL.some((person) => (
    normalizedId === person.personnelId || normalizedName === person.canonicalName
  ));
}

export const ROSTER_NAME_ALIASES = {
  "ABESAMIS, J.": "DM Jhoana",
  "RAMOS, A.": "DM Allan",
  "PADILLA, A.": "DM Allan",
  "ALSHAHRANI, F.": "DM Faisal",
  "DEVILLA, R.": "DM Rea",
  "REYES, J.": "DM Jho",
  "ALHASHYAN, A.": "TCC AlHasyn",
  "ALANAZI, A.": "TCC Alanazi",
  "ALIED, A.": "TCC Asim",
  "ALEID, A.": "TCC Asim",
  "ALOMAR, S.": "TCC Saleh",
  "Madrio, M.": "TC Teresa",
  "Madrio,M.": "TC Teresa",
  "Madrio, M": "TC Teresa",
  "MadrIO, M.": "TC Teresa",
  "MADRIO, M.": "TC Teresa",
  "BIN SHARIL, S.": "TC Sharul",
  "TIWARI, P.": "TC Prab",
  "TAUFEEK, W.": "TC Anwar",
  "FELEMBAN, A.": "TC Anmar",
  "INJAPURI, J.": "TC Jeevan",
  "BAJA, M.": "TC Mike",
  "GUEVARRA, D.": "TC Dennis",
  "ALMUHANNA, A.": "TC Abdullah",
  "SALIK, U.": "TC/DC Usama",
  "ALHAJRI, H.": "DC Hadeel",
  "SHAHBAL, A.": "DC Ashwag",
  "ROMERO, M.": "DC Mark",
  "ALAWAJI, B.": "DC Bandar",
  "DELA CRUZ, D.": "DC Diana",
  "ENRIQUEZ, R.": "DC Roy",
  "VILLACORTA, K.": "DC Kristine",
  "ROSLI, K.": "DC Naim",
  "BIN JAAFAR, M.": "DC Nazif",
  "LOPEZ, A.": "EFC Arnold",
  "FAROOQ, Q.": "EFC Qamar",
  "KALU, A.": "EFC Ali Kalu",
  "ALSAEGH, A.": "EFC Ahmad",
  "AZMATHULLAH, R.": "EFC Rahmah",
};

const ROSTER_TEMPLATE_NAMES = [
  "Abesamis, J.",
  "Ramos, A.",
  "AlShahrani, F.",
  "Devilla, R.",
  "AlHashyan, A.",
  "AlAnazi, A.",
  "Alied, A.",
  "Alomar, S.",
  "Madrio, M.",
  "Bin Sharil, S.",
  "Tiwari, P.",
  "Taufeek, W.",
  "Salik, U.",
  "Felemban, A.",
  "Injapuri, J.",
  "Baja, M.",
  "Guevarra, D.",
  "AlMuhanna, A.",
  "Rosli, K.",
  "Dela Cruz, D.",
  "Villacorta, K.",
  "Bin Jaafar, M.",
  "Romero, M.",
  "Enriquez, R.",
  "AlHajri, H.",
  "Alawaji, B.",
  "AlAqeeli, A.",
  "Shahbal, A.",
  "Lopez, A.",
  "Farooq, Q.",
  "Kalu, A.",
  "Alsaegh, A.",
  "Azmathullah, R.",
  "Alawaji, B.",
  "Almuqbel, A.",
  "AlAmir, A.",
  "AlShahrani, A.",
  "Alnakhli, A.",
  "Alotaibi, Y.",
];

const MONTHS = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const NOT_WORKING_CODES = new Set(["WR", "AL", "CF AL", "TOIL", "UA", "OFF", "REST"]);

function isExtensionDutyCode(dutyCode = "") {
  const normalized = compactSpaces(dutyCode).toUpperCase().replace(/\s+/g, "");
  return /(?:^|-)EXT?(?:TC|TCC|DC|DM|EFC|SC)?(?:-|$)/.test(normalized);
}

function extensionShiftLabel(start = "") {
  const startMinutes = timeToMinutes(start);
  if (startMinutes >= 18 * 60 || startMinutes < 5 * 60) return "Night Extension Shift";
  if (startMinutes < 12 * 60) return "Early Extension Shift";
  return "Late Extension Shift";
}

function repairExtensionEntry(entry, fallbackRole = "") {
  if (!entry || typeof entry !== "object") return entry;
  const source = entry.dutyCode || entry.raw || "";
  const hasTwelveHourRange = entry.timeStart && entry.timeEnd
    ? (() => {
        const start = timeToMinutes(entry.timeStart);
        let end = timeToMinutes(entry.timeEnd);
        if (end <= start) end += 24 * 60;
        return end - start >= 11 * 60;
      })()
    : false;
  if (!isExtensionDutyCode(source) && !hasTwelveHourRange) return entry;
  const shiftLabel = extensionShiftLabel(entry.timeStart || "");
  if (entry.shiftKey === "extension" && entry.shiftLabel === shiftLabel) return entry;
  return { ...entry, shiftKey: "extension", shiftLabel, role: entry.role || fallbackRole, isWorking: true, isRest: false };
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function clusterValues(values, tolerance = 4) {
  const groups = [];
  [...values].sort((a, b) => a - b).forEach((value) => {
    const last = groups[groups.length - 1];
    if (!last || Math.abs(median(last) - value) > tolerance) groups.push([value]);
    else last.push(value);
  });
  return groups;
}

function groupByCoordinate(items, key, tolerance = 5) {
  const groups = [];
  [...items].sort((a, b) => a[key] - b[key]).forEach((item) => {
    const matching = groups.find((group) => Math.abs(median(group.map((entry) => entry[key])) - item[key]) < tolerance);
    if (matching) matching.push(item);
    else groups.push([item]);
  });
  return groups;
}

function compactSpaces(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function canonicalPersonName(value = "") {
  return compactSpaces(value)
    .replace(/\s+,/g, ",")
    .replace(/,\s*/g, ", ")
    .replace(/\s+\./g, ".")
    .toUpperCase();
}

export function preferredRosterName(rawName = "") {
  const key = canonicalPersonName(rawName);
  return ROSTER_NAME_ALIASES[key] || compactSpaces(rawName);
}

export function ensureRosterNames(parsedRoster) {
  if (!parsedRoster?.people?.length) return parsedRoster;

  const sourcePeople = parsedRoster.people.filter((person) => !isExcludedRosterPerson(
    person.rawName || person.name || person.displayName || "",
    person.personnelId || "",
  ));
  const useTemplateFallback = sourcePeople.length === ROSTER_TEMPLATE_NAMES.length;
  let changed = sourcePeople.length !== parsedRoster.people.length;
  const people = sourcePeople.map((person, index) => {
    const currentRawName = compactSpaces(person.rawName || "");
    const currentDisplayName = compactSpaces(person.displayName || "");
    const fallbackRawName = useTemplateFallback ? ROSTER_TEMPLATE_NAMES[index] : "";
    const rawName = currentRawName || fallbackRawName;
    const aliasKey = canonicalPersonName(rawName);
    const preferredName = preferredRosterName(rawName);
    const displayName = ROSTER_NAME_ALIASES[aliasKey]
      ? preferredName
      : (currentDisplayName || preferredName);

    const sourceEntries = person.entries || {};
    let entriesChanged = false;
    const entries = Object.fromEntries(Object.entries(sourceEntries).map(([dateKey, entry]) => {
      const repaired = repairExtensionEntry(entry, person.rosterRole || "");
      if (repaired !== entry) entriesChanged = true;
      return [dateKey, repaired];
    }));

    if (rawName !== currentRawName || displayName !== currentDisplayName || entriesChanged) changed = true;
    return { ...person, rawName, displayName, entries };
  });

  return changed ? { ...parsedRoster, people } : parsedRoster;
}

function inferYear(fileName = "", fallbackYear = new Date().getFullYear()) {
  const yearMatch = String(fileName).match(/(?:19|20)\d{2}/);
  return yearMatch ? Number(yearMatch[0]) : fallbackYear;
}

function rosterDateKey(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function datePartsFromKey(value = "") {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function entryForDate(person, dateRef) {
  if (!person?.entries || dateRef === null || dateRef === undefined || dateRef === "") return undefined;
  const direct = person.entries[dateRef];
  if (direct) return direct;
  const parts = typeof dateRef === "string" ? datePartsFromKey(dateRef) : null;
  const day = parts?.day ?? Number(dateRef);
  return Number.isFinite(day) ? person.entries[day] : undefined;
}

function cleanCellText(value = "") {
  let text = compactSpaces(value);
  text = text.replace(/^(?:8:30|12:00)\s+(?=[A-Z])/i, "");
  text = text.replace(/\s+(?:1|2|3)$/g, "");
  text = text.replace(/\b(8:30|12:00)\s*$/g, "");
  return compactSpaces(text);
}

function timeToMinutes(value = "") {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function shiftFromTimes(start, end, dutyCode = "") {
  const key = `${start}-${end}`;
  const known = {
    "07:00-15:30": { shiftKey: "early", shiftLabel: "Early Shift" },
    "15:00-23:30": { shiftKey: "late", shiftLabel: "Late Shift" },
    "15:00-22:30": { shiftKey: "late", shiftLabel: "Late Shift" },
    "23:00-07:30": { shiftKey: "night", shiftLabel: "Night Shift" },
    "23:00-11:00": { shiftKey: "extension", shiftLabel: "Night Extension Shift" },
    "19:00-07:00": { shiftKey: "extension", shiftLabel: "Night Extension Shift" },
    "07:00-19:00": { shiftKey: "extension", shiftLabel: "Early Extension Shift" },
  };
  if (known[key]) return known[key];

  const startMinutes = timeToMinutes(start);
  let endMinutes = timeToMinutes(end);
  if (endMinutes <= startMinutes) endMinutes += 24 * 60;
  const duration = endMinutes - startMinutes;
  if (duration >= 11 * 60 || isExtensionDutyCode(dutyCode)) {
    return {
      shiftKey: "extension",
      shiftLabel: extensionShiftLabel(start),
    };
  }
  if (startMinutes >= 21 * 60 || startMinutes < 5 * 60) return { shiftKey: "night", shiftLabel: "Night Shift" };
  if (startMinutes < 12 * 60) return { shiftKey: "early", shiftLabel: "Early Shift" };
  return { shiftKey: "late", shiftLabel: "Late Shift" };
}

function roleFromPrefix(prefix = "") {
  const match = prefix.match(/^L3-DEP-(DM|TCC|TC|DC|EFC|SC)\b/i);
  return match ? match[1].toUpperCase() : "OTHER";
}

function roleFromDutyCode(dutyCode = "") {
  const normalized = dutyCode.toUpperCase().replace(/\s+/g, "");
  if (/TCC/.test(normalized)) return "TCC";
  if (/EFC/.test(normalized)) return "EFC";
  if (/(?:^|[-])DM(?:$|[-])/.test(normalized) || /E3-DM|L3-DM|N3-DM/.test(normalized)) return "DM";
  if (/(?:^|[-])DC(?:$|[-])/.test(normalized) || /E3-DC|L3-DC|N3-DC/.test(normalized)) return "DC";
  if (/(?:^|[-])TC(?:$|[-])/.test(normalized) || /E3-TC|L3-TC|N3-TC/.test(normalized)) return "TC";
  if (/(?:^|[-])SC(?:$|[-])/.test(normalized) || /E3-SC|L3-SC|N3-SC/.test(normalized)) return "SC";
  return "";
}

export function normalizeRosterCell(rawText = "", fallbackRole = "") {
  const raw = cleanCellText(rawText);
  if (!raw) {
    return {
      raw: "",
      dutyCode: "",
      timeStart: "",
      timeEnd: "",
      shiftKey: "empty",
      shiftLabel: "No roster entry",
      role: fallbackRole,
      isWorking: false,
      isRest: false,
    };
  }

  const timeMatch = raw.match(TIME_RANGE_RE);
  const dutyCode = compactSpaces(raw.replace(TIME_RANGE_RE, "").replace(/\b(?:8:30|12:00)\b/g, ""));
  const upperCode = dutyCode.toUpperCase();
  const effectiveRole = roleFromDutyCode(dutyCode) || fallbackRole;
  const isRest = NOT_WORKING_CODES.has(upperCode) || /^(WR|AL|CF\s*AL|TOIL|UA|OFF|REST|SICK)\b/.test(upperCode);

  if (isRest) {
    return {
      raw,
      dutyCode: dutyCode || raw,
      timeStart: timeMatch?.[1] || "",
      timeEnd: timeMatch?.[2] || "",
      shiftKey: "rest",
      shiftLabel: "Rest / Leave",
      role: effectiveRole,
      isWorking: false,
      isRest: true,
    };
  }

  if (!timeMatch) {
    const isTraining = /\bTRG\b|TRAINING/.test(upperCode);
    const isBooked = /\bBKD\b/.test(upperCode);
    return {
      raw,
      dutyCode: dutyCode || raw,
      timeStart: "",
      timeEnd: "",
      shiftKey: isTraining ? "training" : isBooked ? "other" : "other",
      shiftLabel: isTraining ? "Training" : isBooked ? "Booked Duty" : "Other Duty",
      role: effectiveRole,
      isWorking: isTraining || isBooked,
      isRest: false,
    };
  }

  const [, timeStart, timeEnd] = timeMatch;
  const shift = shiftFromTimes(timeStart, timeEnd, dutyCode);
  return {
    raw,
    dutyCode,
    timeStart,
    timeEnd,
    ...shift,
    role: effectiveRole,
    isWorking: true,
    isRest: false,
  };
}

function itemCenter(item, viewport, pdfjsLib) {
  const tx = pdfjsLib?.Util?.transform
    ? pdfjsLib.Util.transform(viewport.transform, item.transform)
    : item.transform;
  // PDF.js already reports item.width in viewport units. Multiplying it by the
  // font transform makes wide labels overlap the first date columns and hides names.
  const width = Math.abs((item.width || 0) * (viewport?.scale || 1));
  return {
    text: compactSpaces(item.str),
    x: tx[4] + width / 2,
    y: tx[5],
    width,
    height: Math.abs(item.height || 0),
  };
}

function extractNameFromRow(rowItems, prefixItem, dateAxis, dateCenters) {
  const maxDate = Math.max(...Object.values(dateCenters));
  const minDate = Math.min(...Object.values(dateCenters));
  const dateStep = median(
    Object.values(dateCenters)
      .sort((a, b) => a - b)
      .slice(1)
      .map((value, index, values) => value - (index === 0 ? Math.min(...Object.values(dateCenters)) : values[index - 1]))
      .filter((value) => Number.isFinite(value) && value > 0),
  ) || 18;
  const metaItems = rowItems.filter((item) => {
    const coordinate = item[dateAxis];
    return coordinate < minDate - dateStep * 0.6 || coordinate > maxDate + dateStep * 0.6;
  });

  const sorted = [...metaItems].sort((a, b) => {
    const delta = a[dateAxis] - b[dateAxis];
    return Math.abs(delta) > 1 ? delta : a.text.localeCompare(b.text);
  });
  const prefixIndex = sorted.findIndex((item) => item === prefixItem || item.text === prefixItem.text);
  const afterPrefix = (prefixIndex >= 0 ? sorted.slice(prefixIndex + 1) : sorted)
    .map((item) => item.text)
    .filter(Boolean)
    .filter((token) => !/^\d{1,2}$/.test(token))
    .filter((token) => !/^\d{7}$/.test(token))
    .filter((token) => !/^\d{1,3}:\d{2}$/.test(token))
    .filter((token) => !/^Roster$/i.test(token) && !/^Personnel$/i.test(token) && !/^Paid time$/i.test(token));

  const nameTokens = [];
  for (const token of afterPrefix) {
    if (DATE_TOKEN_RE.test(token) || PREFIX_RE.test(token)) break;
    nameTokens.push(token);
  }
  return compactSpaces(nameTokens.join(" "))
    .replace(/^(?:No\.?\s*)?\d+\s+/i, "");
}

function parsePageItems(items, pageNumber, fileName, pdfjsLib) {
  const dateTokens = items.filter((item) => DATE_TOKEN_RE.test(item.text));
  const baseYear = inferYear(fileName);
  if (dateTokens.length < 20) return { people: [], dates: [], month: null, year: baseYear, warnings: [] };

  const xClusters = clusterValues(dateTokens.map((item) => item.x));
  const yClusters = clusterValues(dateTokens.map((item) => item.y));
  const dateAxis = xClusters.length > yClusters.length ? "x" : "y";
  const rowAxis = dateAxis === "x" ? "y" : "x";

  const headerGroups = groupByCoordinate(dateTokens, rowAxis)
    .filter((group) => group.length >= 20)
    .sort((a, b) => median(a.map((item) => item[rowAxis])) - median(b.map((item) => item[rowAxis])));

  const boundaryPrefixItems = items.filter((item) => PERSONNEL_BOUNDARY_PREFIX_RE.test(item.text));
  const people = [];
  const detectedDates = [];

  headerGroups.forEach((headerGroup, headerIndex) => {
    const headerRow = median(headerGroup.map((item) => item[rowAxis]));
    const nextHeaderRow = headerIndex < headerGroups.length - 1
      ? median(headerGroups[headerIndex + 1].map((item) => item[rowAxis]))
      : Number.POSITIVE_INFINITY;

    let runningYear = baseYear;
    let previousMonth = null;
    const dates = [...headerGroup]
      .sort((a, b) => a[dateAxis] - b[dateAxis])
      .map((item) => {
        const day = Number(item.text.slice(0, 2));
        const month = Number(item.text.slice(3, 5));
        if (previousMonth !== null && month < previousMonth) runningYear += 1;
        previousMonth = month;
        return { ...item, day, month, year: runningYear, key: rosterDateKey(runningYear, month, day) };
      });

    dates.forEach((date) => detectedDates.push(date.key));
    const dateCenters = Object.fromEntries(dates.map((date) => [date.key, date[dateAxis]]));
    const centers = dates.map((date) => date[dateAxis]);

    const sectionBoundaries = boundaryPrefixItems
      .filter((item) => item[rowAxis] > headerRow + 1 && item[rowAxis] < nextHeaderRow - 1)
      .sort((a, b) => a[rowAxis] - b[rowAxis]);
    const sectionPeople = sectionBoundaries.filter((item) => PREFIX_RE.test(item.text));

    sectionPeople.forEach((prefixItem, personIndex) => {
      const boundaryIndex = sectionBoundaries.indexOf(prefixItem);
      const previousRow = boundaryIndex > 0 ? sectionBoundaries[boundaryIndex - 1][rowAxis] : null;
      const followingRow = boundaryIndex < sectionBoundaries.length - 1
        ? sectionBoundaries[boundaryIndex + 1][rowAxis]
        : null;
      // A personnel block extends above and below its roster-code line. Split
      // adjacent blocks at their midpoint so the name, personnel ID, duty code
      // and time range all remain attached to the same person.
      const rowLow = previousRow === null
        ? headerRow + 0.5
        : (previousRow + prefixItem[rowAxis]) / 2;
      const rowHigh = followingRow === null
        ? (Number.isFinite(nextHeaderRow) ? nextHeaderRow - 0.5 : prefixItem[rowAxis] + 42)
        : Math.min(nextHeaderRow - 0.5, (prefixItem[rowAxis] + followingRow) / 2);
      const rowItems = items.filter((item) => item[rowAxis] >= rowLow && item[rowAxis] < rowHigh);
      const rawName = extractNameFromRow(rowItems, prefixItem, dateAxis, dateCenters);
      const personnelId = rowItems
        .map((item) => compactSpaces(item.text))
        .find((token) => /^\d{7}$/.test(token)) || "";
      if (isExcludedRosterPerson(rawName, personnelId)) return;

      const fallbackRole = roleFromPrefix(prefixItem.text);
      const entries = {};

      dates.forEach((date, index) => {
        const center = centers[index];
        let previousBoundary;
        let nextBoundary;
        if (index === 0) {
          const step = Math.abs(centers[1] - centers[0]);
          previousBoundary = center - step / 2;
          nextBoundary = center + step / 2;
        } else if (index === centers.length - 1) {
          const step = Math.abs(centers[index] - centers[index - 1]);
          previousBoundary = center - step / 2;
          nextBoundary = center + step / 2;
        } else {
          previousBoundary = (center + centers[index - 1]) / 2;
          nextBoundary = (center + centers[index + 1]) / 2;
        }
        const low = Math.min(previousBoundary, nextBoundary);
        const high = Math.max(previousBoundary, nextBoundary);
        const cellItems = rowItems
          .filter((item) => item[dateAxis] >= low && item[dateAxis] < high)
          .sort((a, b) => {
            const rowDelta = a[rowAxis] - b[rowAxis];
            return Math.abs(rowDelta) > 0.8 ? rowDelta : b[dateAxis] - a[dateAxis];
          });
        const rawText = cleanCellText(cellItems.map((item) => item.text).join(" "));
        entries[date.key] = normalizeRosterCell(rawText, fallbackRole);
      });

      people.push({
        id: `${pageNumber}-${headerIndex}-${personIndex}-${canonicalPersonName(rawName) || prefixItem.text}`,
        pageNumber,
        rosterCode: prefixItem.text,
        personnelId,
        rosterRole: fallbackRole,
        rawName,
        displayName: preferredRosterName(rawName),
        entries,
      });
    });
  });

  const uniqueDates = [...new Set(detectedDates)].sort();
  const firstDate = datePartsFromKey(uniqueDates[0]);
  return {
    people,
    dates: uniqueDates,
    month: firstDate?.month || null,
    year: firstDate?.year || baseYear,
    warnings: headerGroups.length ? [] : ["No roster date header was detected on this page."],
  };
}

export async function parseRosterPdf(arrayBuffer, fileName = "roster.pdf", pdfjsLib = window.pdfjsLib) {
  if (!pdfjsLib?.getDocument) throw new Error("PDF reader is not available.");
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const allPeople = [];
  const warnings = [];
  const allDates = [];
  let month = null;
  let year = inferYear(fileName);

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    const items = textContent.items
      .filter((item) => compactSpaces(item.str))
      .map((item) => itemCenter(item, viewport, pdfjsLib));
    const parsedPage = parsePageItems(items, pageNumber, fileName, pdfjsLib);
    if (!month && parsedPage.month) month = parsedPage.month;
    if (parsedPage.year) year = parsedPage.year;
    allDates.push(...(parsedPage.dates || []));
    allPeople.push(...parsedPage.people);
    warnings.push(...parsedPage.warnings);
  }

  if (!allPeople.length) {
    throw new Error("No controller roster rows were detected. Please upload the original OCC roster PDF.");
  }

  const dates = [...new Set(allDates)].sort();
  const firstDate = datePartsFromKey(dates[0]);
  const lastDate = datePartsFromKey(dates[dates.length - 1]);
  const days = [...new Set(dates.map((date) => datePartsFromKey(date)?.day).filter(Number.isFinite))].sort((a, b) => a - b);
  const roles = [...new Set(allPeople.map((person) => person.rosterRole).filter(Boolean))]
    .sort((a, b) => ROSTER_ROLE_ORDER.indexOf(a) - ROSTER_ROLE_ORDER.indexOf(b));

  return ensureRosterNames({
    version: ROSTER_PARSER_VERSION,
    parsedAt: new Date().toISOString(),
    fileName,
    year: firstDate?.year || year,
    month: firstDate?.month || month || 1,
    startDate: dates[0] || "",
    endDate: dates[dates.length - 1] || "",
    dates,
    days,
    roles,
    people: allPeople,
    warnings,
  });
}

export function getRosterEntryRole(person, dateRef) {
  return entryForDate(person, dateRef)?.role || person.rosterRole || "OTHER";
}

export function queryRoster(parsedRoster, { dateKey = null, day = null, role = "ALL", includeRest = false, search = "" } = {}) {
  const dateRef = dateKey || day;
  if (!parsedRoster?.people?.length || !dateRef) return [];
  const normalizedRole = String(role || "ALL").toUpperCase();
  const query = compactSpaces(search).toLowerCase();

  return parsedRoster.people
    .filter((person) => !isExcludedRosterPerson(
      person.rawName || person.name || person.displayName || "",
      person.personnelId || "",
    ))
    .map((person) => ({ person, entry: entryForDate(person, dateRef) }))
    .filter(({ entry }) => entry)
    .filter(({ entry }) => includeRest || entry.isWorking)
    .filter(({ person }) => normalizedRole === "ALL" || getRosterEntryRole(person, dateRef) === normalizedRole)
    .filter(({ person, entry }) => {
      if (!query) return true;
      return [person.displayName, person.rawName, person.rosterCode, entry.dutyCode, entry.shiftLabel, entry.role]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    })
    .sort((a, b) => {
      const shiftOrder = ["early", "late", "night", "extension", "training", "other", "rest", "empty"];
      const shiftDelta = shiftOrder.indexOf(a.entry.shiftKey) - shiftOrder.indexOf(b.entry.shiftKey);
      if (shiftDelta) return shiftDelta;
      const roleDelta = ROSTER_ROLE_ORDER.indexOf(getRosterEntryRole(a.person, dateRef)) - ROSTER_ROLE_ORDER.indexOf(getRosterEntryRole(b.person, dateRef));
      if (roleDelta) return roleDelta;
      return String(a.person.displayName || a.person.rawName || a.person.rosterCode || "")
        .localeCompare(String(b.person.displayName || b.person.rawName || b.person.rosterCode || ""));
    });
}

export function parseRosterQuestion(question = "", parsedRoster = null) {
  const text = compactSpaces(question).toLowerCase();
  if (!text) return null;

  let day = null;
  let month = parsedRoster?.month || null;
  let year = parsedRoster?.year || null;
  const numericDate = text.match(/\b(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?\b/);
  if (numericDate) {
    day = Number(numericDate[1]);
    month = Number(numericDate[2]);
    if (numericDate[3]) year = Number(numericDate[3].length === 2 ? `20${numericDate[3]}` : numericDate[3]);
  } else {
    const monthPattern = Object.keys(MONTHS).join("|");
    const namedDate = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthPattern})\\b`, "i"));
    if (namedDate) {
      day = Number(namedDate[1]);
      month = MONTHS[namedDate[2].toLowerCase()];
    } else {
      const ordinal = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/);
      if (ordinal) day = Number(ordinal[1]);
    }
  }

  let role = "ALL";
  if (/\btcc\b/.test(text)) role = "TCC";
  else if (/\befc\b/.test(text)) role = "EFC";
  else if (/\bdm\b|duty manager|depot manager/.test(text)) role = "DM";
  else if (/\bdc\b|depot controller/.test(text)) role = "DC";
  else if (/\btc\b|traffic controller/.test(text)) role = "TC";
  else if (/\bsc\b|station controller/.test(text)) role = "SC";

  return { day, month, year, role };
}

export function formatRosterDate(parsedRoster, dateRef, locale = "en-GB") {
  if (!parsedRoster || !dateRef) return "";
  const parts = typeof dateRef === "string" ? datePartsFromKey(dateRef) : null;
  const date = parts
    ? new Date(parts.year, parts.month - 1, parts.day)
    : new Date(parsedRoster.year, (parsedRoster.month || 1) - 1, Number(dateRef));
  return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);
}

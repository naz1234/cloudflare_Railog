const REQUEST_SUMMARY_MONTHS = {
  JAN: "Jan",
  FEB: "Feb",
  MAR: "Mar",
  APR: "Apr",
  MAY: "May",
  JUN: "Jun",
  JUL: "Jul",
  AUG: "Aug",
  SEP: "Sep",
  OCT: "Oct",
  NOV: "Nov",
  DEC: "Dec",
};

const REQUEST_SUMMARY_DATE_PATTERN = /\b(0?[1-9]|[12]\d|3[01])\s*[-/]?\s*(JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUN(?:E)?|JUL(?:Y)?|AUG(?:UST)?|SEP(?:T(?:EMBER)?)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)(?:\s*[-/,]\s*(\d{2,4}))?\b/gi;
const REQUEST_SUMMARY_TRAILING_DATE_PATTERN = /\b\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?: \d{2,4})?$/;
const REQUEST_SUMMARY_MONTH_FIRST_DATE_PATTERN = /\b(JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUN(?:E)?|JUL(?:Y)?|AUG(?:UST)?|SEP(?:T(?:EMBER)?)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)\s*[-/]?\s*(0?[1-9]|[12]\d|3[01])(?:\s*[-/,]\s*(\d{2,4}))?\b/gi;
const REQUEST_SUMMARY_ANY_DATE_PATTERN = new RegExp(`${REQUEST_SUMMARY_DATE_PATTERN.source}|${REQUEST_SUMMARY_MONTH_FIRST_DATE_PATTERN.source}`, "gi");

function compactRequestedSummaryText(value = "") {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeRequestedSummaryIdentity(value = "") {
  return compactRequestedSummaryText(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .join(" ");
}

export function normalizeRequestedSummaryDates(value = "") {
  // Parse both orders in one pass so a year after a day-first date cannot be
  // mistaken for the day of a second, month-first date.
  return compactRequestedSummaryText(value).replace(
    REQUEST_SUMMARY_ANY_DATE_PATTERN,
    (_match, leadingDay, trailingMonth, trailingYear, leadingMonth, trailingDay, monthFirstYear) => {
      const day = leadingDay || trailingDay;
      const month = trailingMonth || leadingMonth;
      const year = trailingYear || monthFirstYear;
      const monthLabel = REQUEST_SUMMARY_MONTHS[String(month).slice(0, 3).toUpperCase()];
      return `${Number(day)} ${monthLabel}${year ? ` ${year}` : ""}`;
    },
  );
}

export function removeRequestedSummaryLeadingSeparator(value = "") {
  return normalizeRequestedSummaryDates(value)
    .replace(/^[-\u2013\u2014:]+\s*/, "")
    .trim();
}

export function addOnBeforeRequestedSummaryTrailingDate(value = "") {
  const clean = normalizeRequestedSummaryDates(value).replace(/[.!?]+$/, "").trim();
  const dateMatch = clean.match(REQUEST_SUMMARY_TRAILING_DATE_PATTERN);
  if (!dateMatch) return clean;

  const prefix = clean.slice(0, dateMatch.index).trimEnd();
  if (/\bon$/i.test(prefix)) return `${prefix.replace(/\bon$/i, "on")} ${dateMatch[0]}`;
  return `${prefix} on ${dateMatch[0]}`;
}

function formatRequestedSummaryTiming(value = "") {
  const clean = removeRequestedSummaryLeadingSeparator(value).replace(/[.!?]+$/, "").trim();
  if (/^(?:\d{1,2} [A-Z][a-z]{2}\b|\d{1,2}[/-]\d{1,2}\b)/.test(clean)) return `on ${clean}`;
  if (/^(?:ON|AT|TODAY|TONIGHT|TOMORROW|TMRW?|TOM|THIS\s+(?:MORNING|AFTERNOON|EVENING))\b/i.test(clean)) {
    return clean.replace(/^(?:TMRW?|TOM)\b/i, "tomorrow")
      .replace(/^(?:ON|AT|TODAY|TONIGHT|TOMORROW|THIS\s+(?:MORNING|AFTERNOON|EVENING))\b/i, word => word.toLowerCase());
  }
  return "";
}

export function formatRequestedSummaryWashingAction(value = "") {
  const details = removeRequestedSummaryLeadingSeparator(compactRequestedSummaryText(value).replace(/^WASH\b/i, ""))
    .replace(/[.!?]+$/, "").trim();
  if (!details) return "scheduled for washing";
  if (/^WITH\b/i.test(details)) {
    const activity = addOnBeforeRequestedSummaryTrailingDate(details.replace(/^WITH\s*/i, ""));
    return activity ? `washing requested with ${activity}` : "scheduled for washing";
  }
  const timing = formatRequestedSummaryTiming(details);
  return timing ? `scheduled for washing ${timing}` : `washing requested: ${details}`;
}

export function formatRequestedSummaryWorkshopAction(value = "") {
  const direction = getRequestedSummaryWorkshopMovementDirection(value);
  if (!direction) return "";
  const movement = direction === "in" ? "workshop movement from G to C" : "workshop movement from C to G";
  const details = normalizeRequestedSummaryDates(value)
    .replace(/\b(?:INBOUND|OUTBOUND)\b|\b(?:WORKSHOP\s+)?MOVEMENT\b/gi, " ")
    .replace(/\b[GC](?:\s*(?:TO|2|[-–—→])\s*|\s+)[GC]\b/gi, " ")
    .replace(/\(\s*\)/g, " ")
    .replace(/^[\s:;,–—-]+|[\s.!?:;,–—-]+$/g, "")
    .replace(/\s+/g, " ");
  if (!details) return movement;
  const timing = formatRequestedSummaryTiming(details);
  return timing ? `${movement} ${timing}` : `${movement} (${details})`;
}

export function formatRequestedSummaryOtherAction(value = "") {
  const clean = normalizeRequestedSummaryDates(value).replace(/[.!?]+$/, "").trim();
  const normalized = normalizeRequestedSummaryIdentity(clean);

  if (["ALWAYS MANNED", "ALWYS MANNED"].includes(normalized)) {
    return "remain manned at all times";
  }
  if (normalized === "ATC TESTING") return "ATC testing";
  if (normalized === "RESTRICTED") return "restricted operation";
  if (normalized === "UNFIT PARK MODE") return "unfit / park mode";
  if (normalized === "APU ALARM") return "APU alarm";
  const temperature = clean.match(/^SET\s+(-?\d+(?:\.\d+)?)\s*°?\s*C$/i);
  if (temperature) return `set the temperature to ${temperature[1]}°C`;
  if (/^TLC\b/i.test(clean)) return clean.replace(/^TLC\b/i, "TLC").replace(/\bAMPLIFIER\b/gi, "amplifier").replace(/\bCCTV\b/gi, "CCTV");

  if (normalized.startsWith("ATC INSPECTION")) {
    const detail = clean.replace(/^ATC\s+INSPECTION\b/i, "").trim();
    return detail ? addOnBeforeRequestedSummaryTrailingDate(`ATC inspection ${detail}`) : "ATC inspection";
  }

  return clean;
}

export function formatRequestedSummaryEntryCount(value = 0) {
  const count = Math.max(0, Number(value) || 0);
  return `${count} ${count === 1 ? "entry" : "entries"}`;
}

export function getRequestedSummaryWorkshopMovementDirection(value = "") {
  const normalized = normalizeRequestedSummaryIdentity(value);
  if (!normalized) return "";

  if (
    normalized.includes("OUTBOUND") ||
    /(?:^| )C(?: TO)? G(?: |$)/.test(normalized) ||
    normalized.includes("C2G")
  ) {
    return "out";
  }

  if (
    normalized.includes("INBOUND") ||
    /(?:^| )G(?: TO)? C(?: |$)/.test(normalized) ||
    normalized.includes("G2C")
  ) {
    return "in";
  }

  return "";
}

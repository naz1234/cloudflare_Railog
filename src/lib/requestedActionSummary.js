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
  return compactRequestedSummaryText(value).replace(
    REQUEST_SUMMARY_DATE_PATTERN,
    (_match, day, month, year) => {
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
  if (/\bon$/i.test(prefix)) return `${prefix} ${dateMatch[0]}`;
  return `${prefix} on ${dateMatch[0]}`;
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

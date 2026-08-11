const CLOCK_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DISPLAY_TIME_PATTERN = /(\d{1,2}):([0-5]\d)\s*(AM|PM)?/gi;

export function normalizeClockTime(value) {
  const text = String(value ?? "").trim();
  if (CLOCK_TIME_PATTERN.test(text)) return text;

  const twentyFourHourMatch = text.match(/^(\d{1,2}):([0-5]\d)$/);
  if (twentyFourHourMatch && Number(twentyFourHourMatch[1]) <= 23) {
    return `${String(Number(twentyFourHourMatch[1])).padStart(2, "0")}:${twentyFourHourMatch[2]}`;
  }

  const match = text.match(/^(\d{1,2}):([0-5]\d)\s*(AM|PM)$/i);
  if (!match) return "";

  let hours = Number(match[1]);
  if (hours < 1 || hours > 12) return "";
  const meridiem = match[3].toUpperCase();
  if (meridiem === "AM" && hours === 12) hours = 0;
  if (meridiem === "PM" && hours !== 12) hours += 12;
  return `${String(hours).padStart(2, "0")}:${match[2]}`;
}

export function parseStoredTimingRange(value) {
  const matches = Array.from(String(value ?? "").matchAll(DISPLAY_TIME_PATTERN));
  if (matches.length < 2) return null;

  const startTime = normalizeClockTime(`${matches[0][1]}:${matches[0][2]}${matches[0][3] ? ` ${matches[0][3]}` : ""}`);
  const endTime = normalizeClockTime(`${matches[1][1]}:${matches[1][2]}${matches[1][3] ? ` ${matches[1][3]}` : ""}`);
  return startTime && endTime ? { startTime, endTime } : null;
}

function firstValidTime(values = []) {
  for (const value of values) {
    const normalized = normalizeClockTime(value);
    if (normalized) return normalized;
  }
  return "";
}

export function resolveRecordTiming(record = {}, fallback = {}) {
  const source = record && typeof record === "object" ? record : {};
  const fallbackSource = fallback && typeof fallback === "object" ? fallback : {};
  const rangeCandidates = [
    source.timing,
    source.time,
    source.timeRange,
    source.time_range,
    source.dutyTime,
    source.duty_time,
    source.shiftTime,
    source.shift_time,
    source.startTime,
    source.start_time,
  ];
  const storedRange = rangeCandidates
    .map(parseStoredTimingRange)
    .find(Boolean);

  const startTime = firstValidTime([
    source.startTime,
    source.start_time,
    source.start,
    source.timeStart,
    source.time_start,
    storedRange?.startTime,
    fallbackSource.startTime,
    fallbackSource.start_time,
  ]);
  const endTime = firstValidTime([
    source.endTime,
    source.end_time,
    source.end,
    source.timeEnd,
    source.time_end,
    storedRange?.endTime,
    fallbackSource.endTime,
    fallbackSource.end_time,
  ]);

  return { startTime, endTime };
}

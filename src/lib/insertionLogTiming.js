export function normalizeInsertionLogTime(value = "") {
  const raw = String(value).trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/) || raw.match(/^(\d{1,2})(\d{2})$/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return "";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

export function getInsertionLogTiming(entry = {}, text = "") {
  return {
    time: normalizeInsertionLogTime(entry.time) || normalizeInsertionLogTime(text.match(/^(\d{1,2}:\d{2})\s+hrs/i)?.[1]),
    clearTime: normalizeInsertionLogTime(entry.clearTime) || normalizeInsertionLogTime(text.match(/Track confirmed clear at (\d{1,2}:\d{2}) hrs\./i)?.[1]),
  };
}

export function defaultSweepEndTime(startTime) {
  const time = normalizeInsertionLogTime(startTime);
  if (!time) return "";
  const [hours, minutes] = time.split(":").map(Number);
  const endMinutes = (hours * 60 + minutes + 2) % (24 * 60);
  return `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
}

export function previewInsertionLogTiming(text = "", time, clearTime) {
  let preview = text.replace(/^\d{1,2}:\d{2}(?=\s+hrs)/i, time);
  if (clearTime) preview = preview.replace(/(Track confirmed clear at )\d{1,2}:\d{2}( hrs\.)/i, (_, before, after) => `${before}${clearTime}${after}`);
  return preview;
}

export function cleanCompactTimeInput(value) {
  const raw = String(value || "").replace(/[^\d:]/g, "").slice(0, 5);
  if (raw.includes(":")) {
    const [hour = "", minute = ""] = raw.split(":");
    return `${hour.slice(0, 2)}:${minute.slice(0, 2)}`;
  }

  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 1) return digits;
  if (digits.length === 2) return `${digits}:`;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

export function normalizeCompactTimeInput(value) {
  const raw = String(value || "").replace(/[^\d:]/g, "").slice(0, 5);
  if (!raw) return "";

  let hourText = "";
  let minuteText = "";

  if (raw.includes(":")) {
    const [hour = "", minute = ""] = raw.split(":");
    hourText = hour.slice(0, 2);
    minuteText = minute.slice(0, 2) || "00";
  } else {
    const digits = raw.replace(/\D/g, "").slice(0, 4);
    if (!digits) return "";
    hourText = digits.length <= 2 ? digits : digits.slice(0, 2);
    minuteText = digits.length <= 2 ? "00" : digits.slice(2);
  }

  const hour = Math.min(Math.max(Number(hourText || 0), 0), 23);
  const minute = Math.min(Math.max(Number(minuteText || 0), 0), 59);

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function isCompleteCompactTimeInput(value) {
  const match = String(value || "").match(/^(\d{2}):(\d{2})$/);
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

export function formatCompactTime(date = new Date()) {
  const resolved = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(resolved.getTime())) return "";
  return [resolved.getHours(), resolved.getMinutes()]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

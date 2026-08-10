export const DUTY_CHECKLIST_SHIFTS = [
  { value: "early", label: "Early Shift" },
  { value: "late", label: "Late Shift" },
  { value: "night", label: "Night Shift" },
];

const VALID_SHIFT_KEYS = new Set(DUTY_CHECKLIST_SHIFTS.map((shift) => shift.value));

export function getChecklistLocalDate(date = new Date()) {
  const safeDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const localDate = new Date(safeDate.getTime() - safeDate.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}
export function normalizeChecklistShift(value = "late") {
  const clean = String(value || "").trim().toLowerCase();
  return VALID_SHIFT_KEYS.has(clean) ? clean : "late";
}

export function getChecklistShiftLabel(value = "late") {
  const normalized = normalizeChecklistShift(value);
  return DUTY_CHECKLIST_SHIFTS.find((shift) => shift.value === normalized)?.label || "Late Shift";
}

export function buildChecklistScopeKey(date = "", shift = "late") {
  const cleanDate = /^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))
    ? String(date)
    : getChecklistLocalDate();
  return `${cleanDate}:${normalizeChecklistShift(shift)}`;
}

export function createChecklistItem(text = "", options = {}) {
  const now = options.now || new Date().toISOString();
  const id = options.id || globalThis.crypto?.randomUUID?.()
    || `chk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id: String(id),
    text: String(text || "").trim(),
    completed: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeChecklistItem(item = {}, index = 0) {
  const now = new Date().toISOString();
  return {
    id: String(item.id || `chk-item-${index + 1}`),
    text: String(item.text || "").trim(),
    completed: item.completed === true || item.completed === "true",
    createdAt: String(item.createdAt || item.created_date || now),
    updatedAt: String(item.updatedAt || item.updated_date || item.createdAt || now),
  };
}

export function normalizeChecklistItems(items = []) {
  const seenIds = new Set();
  return (Array.isArray(items) ? items : [])
    .map((item, index) => normalizeChecklistItem(item, index))
    .filter((item) => {
      if (!item.text || seenIds.has(item.id)) return false;
      seenIds.add(item.id);
      return true;
    });
}

export function getChecklistRecordUpdatedMs(record = {}) {
  return Date.parse(
    record.updatedAt
      || record.updated_date
      || record.createdAt
      || record.created_date
      || "",
  ) || 0;
}

export function selectLatestChecklistRecord(records = [], scopeKey = "") {
  const matchingRecords = (Array.isArray(records) ? records : [])
    .filter((record) => String(record?.scopeKey || "") === String(scopeKey || ""));

  return matchingRecords.sort(
    (left, right) => getChecklistRecordUpdatedMs(right) - getChecklistRecordUpdatedMs(left),
  )[0] || null;
}

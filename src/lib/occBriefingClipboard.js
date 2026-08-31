export const OCC_BRIEFING_COPY_COLUMN_COUNT = 6;

function normalizeClipboardCell(value) {
  return String(value ?? "")
    .replace(/\t/g, " ")
    .replace(/\r?\n/g, " ")
    .trim();
}

export function buildOccBriefingClipboardText({
  employeeId = "",
  employeeName = "",
  position = "",
  timeIn = "",
  timeOut = "",
  signature = "",
} = {}) {
  const normalizedName = normalizeClipboardCell(employeeName);

  return [
    employeeId,
    normalizedName,
    position,
    timeIn,
    timeOut,
    normalizeClipboardCell(signature) || normalizedName,
  ]
    .map(normalizeClipboardCell)
    .join("\t");
}

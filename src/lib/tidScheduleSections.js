export const UPCOMING_SECTION_GAP_MINUTES = 30;

function parseClockMinutes(value = "") {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  return (hours * 60) + minutes;
}

export function hasLargeTimetableGap(
  previousTime = "",
  currentTime = "",
  minimumGapMinutes = UPCOMING_SECTION_GAP_MINUTES,
) {
  const previousMinutes = parseClockMinutes(previousTime);
  const currentMinutes = parseClockMinutes(currentTime);
  const minimumGap = Number(minimumGapMinutes);

  if (previousMinutes === null || currentMinutes === null) return false;
  if (!Number.isFinite(minimumGap) || minimumGap <= 0) return false;

  return currentMinutes - previousMinutes >= minimumGap;
}

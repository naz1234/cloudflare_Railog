// Input rows must already be filtered to the intended depot by Removal Summary.
// TID-less HDW/manual rows are intentionally not labelled as TID removals.
export function buildRemovalInfoByTrain(rows = []) {
  const byTrain = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const trainMatch = String(row?.trainId || "").trim().match(/^T?0*(\d+)$/i);
    const tidMatch = String(row?.tid || "").trim().match(/^(?:TID\s*)?0*(\d{1,3})$/i);
    if (!trainMatch || !tidMatch || Number(trainMatch[1]) === 0 || Number(tidMatch[1]) === 0) continue;

    const trainId = String(Number(trainMatch[1])).padStart(2, "0");
    const tid = String(Number(tidMatch[1])).padStart(3, "0");
    const rawTiming = String(row?.timing || "").trim();
    const timeMatch = rawTiming.match(/^(\d{1,2}):(\d{2})$/);
    const timing = timeMatch && Number(timeMatch[1]) < 24 && Number(timeMatch[2]) < 60
      ? `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}`
      : "";
    const removals = byTrain.get(trainId) || [];
    if (!removals.some((entry) => entry.tid === tid && entry.timing === timing)) {
      removals.push({ tid, timing });
      byTrain.set(trainId, removals);
    }
  }

  return byTrain;
}

// Retain the original export for West-only callers.
export const buildWestRemovalInfoByTrain = buildRemovalInfoByTrain;

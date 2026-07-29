export function normalizeInsertionTidKey(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  const numericTid = Number(digits);
  return Number.isFinite(numericTid) && numericTid > 0 ? String(numericTid) : "";
}

export function summarizeInsertionTidUsage(tids = []) {
  const usageCounts = new Map();

  for (const tid of tids) {
    const key = normalizeInsertionTidKey(tid);
    if (!key) continue;
    usageCounts.set(key, (usageCounts.get(key) || 0) + 1);
  }

  return {
    usedTidKeys: Array.from(usageCounts.keys()),
    duplicateTidKeys: Array.from(usageCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([tid]) => tid),
  };
}

export function isInsertionTidAssigned(tid, usedTidKeys, enabled = true) {
  if (!enabled) return false;
  const key = normalizeInsertionTidKey(tid);
  return Boolean(key && usedTidKeys?.has?.(key));
}

export function countAssignedInsertionRows(rows = [], usedTidKeys, enabled = true) {
  if (!enabled) return 0;
  return rows.filter(({ tid }) => isInsertionTidAssigned(tid, usedTidKeys)).length;
}

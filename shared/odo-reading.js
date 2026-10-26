export const ODO_TRAINSETS = Array.from({ length: 47 }, (_, index) => `TS${String(index + 1).padStart(2, "0")}`);
const trainsets = new Set(ODO_TRAINSETS);

export function emptyOdoState() {
  return {
    mileages: Object.fromEntries(ODO_TRAINSETS.map((train) => [train, ""])),
    workshops: Object.fromEntries(ODO_TRAINSETS.map((train) => [train, false])),
    cmmsReport: null,
  };
}

export function validateCmmsReport(report) {
  if (report === null) return null;
  if (!report || typeof report !== "object" || Array.isArray(report)) throw new Error("Invalid CMMS output.");
  const { operationCount, maintenanceCount, totalCount, maintenanceTrainsets } = report;
  if (![operationCount, maintenanceCount, totalCount].every((count) => Number.isInteger(count) && count >= 0 && count <= 47)
    || totalCount !== operationCount + maintenanceCount
    || !Array.isArray(maintenanceTrainsets) || maintenanceTrainsets.length !== maintenanceCount
    || new Set(maintenanceTrainsets).size !== maintenanceCount
    || maintenanceTrainsets.some((train) => !/^T(?:0[1-9]|[1-3][0-9]|4[0-7])$/.test(train))
    || typeof report.fileName !== "string" || report.fileName.length > 255
    || typeof report.reportTimestamp !== "string" || !report.reportTimestamp || report.reportTimestamp.length > 100) {
    throw new Error("Invalid CMMS output.");
  }
  return { fileName: report.fileName, reportTimestamp: report.reportTimestamp, operationCount, maintenanceCount, totalCount, maintenanceTrainsets: [...maintenanceTrainsets] };
}

export function normalizeOdoState(value) {
  const state = emptyOdoState();
  for (const train of ODO_TRAINSETS) {
    const mileage = String(value?.mileages?.[train] ?? "");
    state.mileages[train] = /^\d{0,6}$/.test(mileage) ? mileage : "";
    state.workshops[train] = value?.workshops?.[train] === true;
  }
  try { state.cmmsReport = validateCmmsReport(value?.cmmsReport ?? null); } catch { /* Ignore an invalid local cache report. */ }
  return state;
}

export function validateOdoChanges(changes) {
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) throw new Error("Invalid ODO changes.");
  const entries = Object.entries(changes);
  if (!entries.length || entries.length > 95) throw new Error("No valid ODO changes were supplied.");
  return Object.fromEntries(entries.map(([key, value]) => {
    if (key === "cmmsReport") return [key, validateCmmsReport(value)];
    const [field, train, extra] = key.split(".");
    if (extra || !trainsets.has(train)) throw new Error("Invalid ODO trainset.");
    if (field === "mileages" && typeof value === "string" && /^\d{0,6}$/.test(value)) return [key, value];
    if (field === "workshops" && typeof value === "boolean") return [key, value];
    throw new Error("Invalid ODO field or value.");
  }));
}

export function applyOdoChanges(state, changes) {
  const next = normalizeOdoState(state);
  for (const [key, value] of Object.entries(changes)) {
    if (key === "cmmsReport") next.cmmsReport = value;
    else {
      const [field, train] = key.split(".");
      next[field][train] = value;
    }
  }
  return next;
}

export function diffOdoState(previous, next) {
  const changes = {};
  for (const field of ["mileages", "workshops"]) {
    for (const train of ODO_TRAINSETS) {
      if (previous[field][train] !== next[field][train]) changes[`${field}.${train}`] = next[field][train];
    }
  }
  if (JSON.stringify(previous.cmmsReport) !== JSON.stringify(next.cmmsReport)) changes.cmmsReport = next.cmmsReport;
  return changes;
}

export function hasOdoData(state) {
  return Object.keys(diffOdoState(emptyOdoState(), normalizeOdoState(state))).length > 0;
}

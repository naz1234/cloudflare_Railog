function normalizeManualEntryType(value = "") {
  return /prep/i.test(String(value || "")) ? "Prep" : "PST";
}
function normalizeManualDepot(value = "") {
  return String(value || "").toLowerCase() === "east" ? "east" : "west";
}

export function normalizePSTManualTrainKey(value = "") {
  const match = String(value || "").trim().toUpperCase().match(/^(?:T|TS)?\s*0*(\d{1,3})$/);
  if (!match) return "";
  return `T${match[1].padStart(2, "0")}`;
}

export function normalizePSTManualTime(value = "") {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return "";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function addMinutesToPSTManualTime(value = "", minutesToAdd = 6) {
  const normalized = normalizePSTManualTime(value);
  if (!normalized) return "";
  const [hours, minutes] = normalized.split(":").map(Number);
  const totalMinutes = (hours * 60 + minutes + Number(minutesToAdd || 0) + 1440) % 1440;
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

export function normalizePSTManualLocation(value = "", depot = "west") {
  const normalizedDepot = normalizeManualDepot(depot);
  const depotPrefix = normalizedDepot === "east" ? "ED" : "WD";
  const clean = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, "");
  if (!clean) return "";
  if (/^(WD|ED)-/.test(clean)) return clean;
  if (/^ST\d+$/i.test(clean)) return `${depotPrefix}-${clean}`;
  return `${depotPrefix}-${clean.replace(/^-+/, "")}`;
}

function normalizeTAName(value = "") {
  return String(value || "")
    .trim()
    .replace(/\.+$/g, "")
    .replace(/^TA\b\s*/i, "")
    .trim();
}

function makeManualEntryKey(type = "PST") {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return `manual-${type.toLowerCase()}-${suffix}`;
}

export function getPSTManualEntrySignature(entry = {}) {
  const type = normalizeManualEntryType(entry.type);
  const depot = normalizeManualDepot(entry.depot);
  const trainKey = normalizePSTManualTrainKey(entry.trainKey || entry.trainId);
  const road = normalizePSTManualLocation(entry.road || entry.location, depot);
  const startTime = normalizePSTManualTime(entry.startTime);
  const endTime = normalizePSTManualTime(entry.endTime || entry.time);
  return [type, depot, trainKey, road, startTime, endTime].join("|");
}

export function buildPSTManualLogEntry(input = {}) {
  const type = normalizeManualEntryType(input.type);
  const depot = normalizeManualDepot(input.depot);
  const trainKey = normalizePSTManualTrainKey(input.trainKey || input.trainId);
  const road = normalizePSTManualLocation(input.road || input.location, depot);

  if (!trainKey) throw new Error("Enter a valid train ID.");
  if (!road) throw new Error("Select a stabling location.");
  if (depot === "west" && !road.startsWith("WD-")) throw new Error("Select a West Depot location.");
  if (depot === "east" && !road.startsWith("ED-")) throw new Error("Select an East Depot location.");

  if (type === "Prep") {
    const endTime = normalizePSTManualTime(input.endTime || input.time);
    if (!endTime) throw new Error("Enter a valid completion time.");
    const taName = normalizeTAName(input.taName || input.completedBy);
    const completedByText = taName ? ` Performed by TA ${taName}.` : "";
    return {
      key: input.key || makeManualEntryKey(type),
      text: `${endTime} hrs \u2013 ${trainKey} Train preparation completed at ${road.replace("-", "\u2013")}.${completedByText}`,
      type,
      depot,
      road,
      trainKey,
      startTime: "",
      time: endTime,
      endTime,
      taName,
      manualEntry: true,
      source: "manual",
      createdAt: input.createdAt || new Date().toISOString(),
    };
  }

  const startTime = normalizePSTManualTime(input.startTime);
  const endTime = normalizePSTManualTime(input.endTime) || addMinutesToPSTManualTime(startTime, 6);
  if (!startTime) throw new Error("Enter a valid PST start time.");
  if (!endTime) throw new Error("Enter a valid PST completion time.");
  const alarmStatus = String(input.alarmStatus || "no_alarm").toLowerCase() === "alarm" ? "alarm" : "no_alarm";
  const alarmText = alarmStatus === "alarm" ? " Alarm reported." : " No alarm reported.";

  return {
    key: input.key || makeManualEntryKey(type),
    text: `${startTime} hrs \u2013 PST commenced at ${road.replace("-", "\u2013")} for ${trainKey}. Completed at ${endTime} hrs.${alarmText}`,
    type,
    depot,
    road,
    trainKey,
    startTime,
    endTime,
    alarmStatus,
    manualEntry: true,
    source: "manual",
    createdAt: input.createdAt || new Date().toISOString(),
  };
}

const VALID_SLEEP_MODES = new Set(["sleep", "wake"]);

export function normalizeSleepTrainId(value = "") {
  const match = String(value || "").toUpperCase().match(/(?:TS?|TRAIN\s*)?(\d{1,2})/);
  if (!match) return "";
  const number = Number(match[1]);
  if (!Number.isInteger(number) || number < 1 || number > 99) return "";
  return String(number).padStart(2, "0");
}

export function formatSleepTrainLabel(value = "") {
  const trainId = normalizeSleepTrainId(value);
  return trainId ? `T${trainId}` : "";
}

export function formatSleepLocation(value = "") {
  return String(value || "").trim().toUpperCase().replace(/-/g, "\u2013");
}

export function getSleepModeDepot(value = "") {
  const location = String(value || "").trim().toUpperCase().replace(/\u2013/g, "-");
  if (location.startsWith("WD-")) return "west";
  if (location.startsWith("ED-")) return "east";
  return "";
}

export function normalizeSleepMode(value = "sleep") {
  const clean = String(value || "").trim().toLowerCase();
  return VALID_SLEEP_MODES.has(clean) ? clean : "sleep";
}

export function formatSleepTrainList(trainIds = []) {
  const labels = [];
  const seen = new Set();

  (Array.isArray(trainIds) ? trainIds : []).forEach((trainId) => {
    const label = formatSleepTrainLabel(trainId);
    if (!label || seen.has(label)) return;
    seen.add(label);
    labels.push(label);
  });

  if (labels.length <= 1) return labels[0] || "";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

export function normalizeSleepLogTime(value = "") {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function formatSleepTimeInput(value = "") {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

export function normalizeSleepRemark(value = "") {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function buildSleepModeLogLine({ time = "", trainIds = [], location = "", mode = "sleep", remark = "" } = {}) {
  const normalizedTime = normalizeSleepLogTime(time);
  const trainList = formatSleepTrainList(trainIds);
  const normalizedLocation = formatSleepLocation(location);
  if (!normalizedTime || !trainList || !normalizedLocation) return "";

  const normalizedMode = normalizeSleepMode(mode);
  const status = normalizedMode === "wake"
    ? `${trainList} successfully in wake-up mode`
    : `${trainList} confirmed successfully in sleep mode`;
  const baseLine = `${normalizedTime} hrs \u2013 ${status} at ${normalizedLocation}.`;
  const normalizedRemark = normalizeSleepRemark(remark);
  if (!normalizedRemark) return baseLine;
  return `${baseLine} \u2013 ${normalizedRemark}`;
}

export function createSleepModeLogEntry(source = {}, options = {}) {
  const createdAt = String(options.now || source.createdAt || new Date().toISOString());
  const trainIds = [];
  const seen = new Set();
  (Array.isArray(source.trainIds) ? source.trainIds : []).forEach((value) => {
    const trainId = normalizeSleepTrainId(value);
    if (!trainId || seen.has(trainId)) return;
    seen.add(trainId);
    trainIds.push(trainId);
  });

  const entry = {
    id: String(options.id || source.id || globalThis.crypto?.randomUUID?.()
      || `slp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    time: normalizeSleepLogTime(source.time),
    trainIds,
    location: String(source.location || "").trim().toUpperCase(),
    mode: normalizeSleepMode(source.mode),
    remark: normalizeSleepRemark(source.remark),
    createdAt,
  };

  return {
    ...entry,
    text: buildSleepModeLogLine(entry),
  };
}

export function normalizeSleepModeLogs(logs = []) {
  const seen = new Set();
  return (Array.isArray(logs) ? logs : [])
    .map((entry, index) => createSleepModeLogEntry(entry, {
      id: entry?.id || `slp-entry-${index + 1}`,
      now: entry?.createdAt || entry?.created_date || new Date().toISOString(),
    }))
    .filter((entry) => {
      if (!entry.text || seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    })
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
}

export function groupSleepModeLogs(logs = []) {
  const grouped = { sleep: [], wake: [] };
  normalizeSleepModeLogs(logs).forEach((entry) => grouped[entry.mode].push(entry));
  return grouped;
}

export function buildSleepModeGroupedText(logs = []) {
  const grouped = groupSleepModeLogs(logs);
  const formatSection = (title, entries) => [
    title,
    ...entries.map((entry) => entry.text),
  ].join("\n\n");

  return [
    formatSection("SLEEP MODE", grouped.sleep),
    formatSection("WAKE-UP MODE", grouped.wake),
  ].join("\n\n");
}

export function getSleepModeRecordUpdatedMs(record = {}) {
  return Date.parse(
    record.updatedAt
      || record.updated_date
      || record.createdAt
      || record.created_date
      || "",
  ) || 0;
}

export function selectLatestSleepModeRecord(records = [], recordKey = "sleep-mode-main") {
  return (Array.isArray(records) ? records : [])
    .filter((record) => String(record?.recordKey || "") === recordKey)
    .sort((left, right) => getSleepModeRecordUpdatedMs(right) - getSleepModeRecordUpdatedMs(left))[0] || null;
}

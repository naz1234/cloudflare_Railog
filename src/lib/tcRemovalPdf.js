function normalizeTcTid(value = "") {
  return String(value || "").replace(/\D/g, "").slice(0, 3);
}

function normalizeTcTimetableTime(value = "") {
  return String(value || "").trim().replace(/\s*hrs?\.?$/i, "");
}

function tcTimeToMinutes(value = "") {
  const match = normalizeTcTimetableTime(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return Number.POSITIVE_INFINITY;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return Number.POSITIVE_INFINITY;
  return hours * 60 + minutes;
}

function getParsedTimetable(activeTimetable = null) {
  return activeTimetable?.parsedData || activeTimetable?.data || null;
}

export function getTcActiveTimetableRemovalTime(
  activeTimetable = null,
  depot = "west",
  presetLabel = "9am",
  tid = "",
) {
  const parsed = getParsedTimetable(activeTimetable);
  const depotKey = depot === "east" ? "east" : "west";
  const tidKey = normalizeTcTid(tid);
  if (!parsed || !tidKey) return "";

  const depotRemoval = parsed?.removal?.[depotKey] || {};
  const preset = depotRemoval?.presets?.[presetLabel] || null;
  const entries = Array.isArray(preset?.entries) && preset.entries.length
    ? preset.entries
    : Array.isArray(depotRemoval?.entries)
      ? depotRemoval.entries
      : [];
  const exactEntry = entries.find((entry) => normalizeTcTid(entry?.tid) === tidKey);
  if (exactEntry?.timetableTime !== undefined
    && exactEntry?.timetableTime !== null
    && String(exactEntry.timetableTime).trim()) {
    return normalizeTcTimetableTime(exactEntry.timetableTime);
  }

  const presetTime = preset?.timeMap?.[tidKey];
  if (presetTime !== undefined && presetTime !== null && String(presetTime).trim()) {
    return normalizeTcTimetableTime(presetTime);
  }

  return normalizeTcTimetableTime(exactEntry?.time);
}

export function buildTcRemovalPdfLog(
  removalLog = {},
  activeTimetable = null,
  depot = "west",
  presetLabel = "9am",
) {
  const entries = (Array.isArray(removalLog?.entries) ? removalLog.entries : [])
    .map((entry, index) => ({
      ...entry,
      time: getTcActiveTimetableRemovalTime(
        activeTimetable,
        depot,
        presetLabel,
        entry?.tid,
      ),
      remark: "",
      remarkPills: [],
      remarkFill: "",
      __tcOriginalIndex: index,
    }))
    .sort((left, right) => {
      const timeDifference = tcTimeToMinutes(left.time) - tcTimeToMinutes(right.time);
      if (Number.isFinite(timeDifference) && timeDifference !== 0) return timeDifference;
      if (Number.isFinite(tcTimeToMinutes(left.time)) !== Number.isFinite(tcTimeToMinutes(right.time))) {
        return Number.isFinite(tcTimeToMinutes(left.time)) ? -1 : 1;
      }
      return left.__tcOriginalIndex - right.__tcOriginalIndex;
    })
    .map(({ __tcOriginalIndex, ...entry }) => entry);

  return {
    ...removalLog,
    entries,
  };
}

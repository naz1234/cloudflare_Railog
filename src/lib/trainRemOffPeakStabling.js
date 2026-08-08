const OFF_PEAK_PRESET_LABELS = new Set(["9am", "7pm"]);

function normalizeTrainKey(value = "") {
  const cleaned = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!cleaned) return "";

  const match = cleaned.match(/^T?(\d+)$/);
  if (!match) return cleaned;

  return `T${Number.parseInt(match[1], 10)}`;
}

function includesTrainKey(trainIds = [], trainKey = "") {
  if (!trainKey || !trainIds || typeof trainIds[Symbol.iterator] !== "function") return false;

  for (const value of trainIds) {
    if (normalizeTrainKey(value) === trainKey) return true;
  }

  return false;
}

export function getOffPeakStablingMatch(trainId = "", westTrainIds = [], eastTrainIds = []) {
  const trainKey = normalizeTrainKey(trainId);
  if (!trainKey) return null;

  const depotCodes = [];
  if (includesTrainKey(westTrainIds, trainKey)) depotCodes.push("WD");
  if (includesTrainKey(eastTrainIds, trainKey)) depotCodes.push("ED");
  if (!depotCodes.length) return null;

  return {
    trainKey,
    depotCodes,
    tooltip: `Train found in ${depotCodes.join(" and ")} Stabling. Remove ?`,
  };
}

export function shouldShowRemovalTidStablingRemove({
  selectedPreset = "",
  referenceOnly = false,
  stablingMatch = null,
} = {}) {
  return Boolean(
    referenceOnly
    && OFF_PEAK_PRESET_LABELS.has(String(selectedPreset || ""))
    && stablingMatch?.depotCodes?.length
  );
}

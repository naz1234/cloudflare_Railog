function normalizeLookupTrainId(value = "", requireTwoDigits = false) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 2);
  if (!digits || (requireTwoDigits && digits.length !== 2)) return "";
  return String(Number(digits));
}

export function getSwappingTidFromRemovalRows(rows = [], trainId = "") {
  const trainKey = normalizeLookupTrainId(trainId, true);
  if (!trainKey) return "";

  const match = (Array.isArray(rows) ? rows : []).find((row) => (
    normalizeLookupTrainId(row?.trainId) === trainKey
  ));

  return String(match?.tid || "").replace(/\D/g, "").slice(0, 3);
}

export function getSwappingAutoFillFields({ trainId = "", removalRows = [], reason = "" } = {}) {
  const trainKey = normalizeLookupTrainId(trainId, true);
  if (!trainKey) {
    return { trainKey: "", tid: "", reason: "" };
  }

  return {
    trainKey,
    tid: getSwappingTidFromRemovalRows(removalRows, trainId),
    reason: String(reason || "").trim(),
  };
}

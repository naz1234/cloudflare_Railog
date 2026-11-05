const REQUEST_STATUS_RANK = {
  STABLING: 0,
  WORKSHOP: 2,
};

function getStatusRank(status = "") {
  // Match the displayed tick: West green, East red, workshop amber, then pending.
  // Keep reason-only callbacks compatible with callers that have no depot data.
  const info = typeof status === "string" ? { reason: status } : status || {};
  if (info.reason === "STABLING" && info.depot === "east") return 1;
  return REQUEST_STATUS_RANK[info.reason] ?? 3;
}

export function sortRequestsByStatusThenTrain(
  items = [],
  getStatusInfo = () => "",
  getTrainKey = (item) => item?.trainId || "",
) {
  return [...items].sort((a, b) => {
    const statusSort = getStatusRank(getStatusInfo(a)) - getStatusRank(getStatusInfo(b));
    if (statusSort) return statusSort;

    return getTrainKey(a).localeCompare(getTrainKey(b), undefined, { numeric: true });
  });
}

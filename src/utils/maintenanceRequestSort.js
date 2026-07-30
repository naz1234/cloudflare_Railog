const REQUEST_STATUS_RANK = {
  STABLING: 0,
  WORKSHOP: 1,
};

function getStatusRank(reason = "") {
  return REQUEST_STATUS_RANK[reason] ?? 2;
}

export function sortRequestsByStatusThenTrain(
  items = [],
  getStatusReason = () => "",
  getTrainKey = (item) => item?.trainId || "",
) {
  return [...items].sort((a, b) => {
    const statusSort = getStatusRank(getStatusReason(a)) - getStatusRank(getStatusReason(b));
    if (statusSort) return statusSort;

    return getTrainKey(a).localeCompare(getTrainKey(b), undefined, { numeric: true });
  });
}

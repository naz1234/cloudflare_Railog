function normalizeTrainId(value = "") {
  const cleaned = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  const match = cleaned.match(/^T?(\d+)$/);
  if (!match) return "";

  const number = Number.parseInt(match[1], 10);
  return Number.isFinite(number) ? String(number).padStart(2, "0") : "";
}

export function normalizeInsertionSyncTid(value = "") {
  const cleaned = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  const match = cleaned.match(/^(?:TID[:\-]?)?T?(\d{3})$/);
  return match ? match[1] : "";
}

export function buildInsertionTidAssignments({ data = {}, tidInputs = {}, insertionLog = [] } = {}) {
  const assignments = {};
  const logByCell = new Map(
    (Array.isArray(insertionLog) ? insertionLog : [])
      .filter((entry) => entry && !entry.isSweeping && entry.key)
      .map((entry) => [String(entry.key).replace(/^ins-/, ""), entry]),
  );

  Object.entries(data || {}).forEach(([road, blocks]) => {
    (Array.isArray(blocks) ? blocks : []).forEach((block, blockIndex) => {
      const trainId = normalizeTrainId(block?.trainId);
      if (!trainId) return;

      const cellKey = `${road}-${blockIndex}`;
      const liveTid = normalizeInsertionSyncTid(tidInputs?.[cellKey]);
      const logEntry = logByCell.get(cellKey);
      const logMatchesTrain = normalizeTrainId(logEntry?.trainKey) === trainId;
      const loggedTid = logMatchesTrain
        ? normalizeInsertionSyncTid(logEntry?.tid ?? logEntry?.inputValue)
        : "";
      const assignedTid = liveTid || loggedTid;

      if (assignedTid) assignments[assignedTid] = trainId;
    });
  });

  return assignments;
}

export function applyInsertionAssignmentsToRemovalRows(
  rows = [],
  assignmentsByDepot = {},
  resolveDepot = () => "west",
) {
  return (Array.isArray(rows) ? rows : []).map((row, rowIndex) => {
    const tid = normalizeInsertionSyncTid(row?.tid);
    const depot = resolveDepot(row, rowIndex) === "east" ? "east" : "west";
    const trainId = tid ? assignmentsByDepot?.[depot]?.[tid] : "";

    if (trainId) {
      return { ...row, trainId, tid };
    }

    return { ...row, trainId: "", tid: "" };
  });
}

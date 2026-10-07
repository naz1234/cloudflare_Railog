export function removalScanFingerprint(state, timetableKey = '') {
  return JSON.stringify({ timetableKey, selectedPreset: state.selectedPreset, rows: state.rows });
}

export function applyRemovalImageAssignments(state, assignments) {
  const byTid = new Map();
  const trains = new Set();
  for (const { trainId, tid } of assignments || []) {
    if (!/^\d{2}$/.test(trainId) || trainId === '00' || (tid && !/^[1-9]\d{2}$/.test(tid))) {
      throw new Error('The scan contains an invalid train or TID.');
    }
    if (trains.has(trainId) || (tid && byTid.has(tid))) throw new Error('The scan contains duplicate assignments.');
    trains.add(trainId);
    if (tid) byTid.set(tid, trainId);
  }
  if (!trains.size) throw new Error('The scan did not contain a valid train table.');
  const rows = Object.fromEntries(['west', 'east'].map((depot) => [depot,
    (state.rows?.[depot] || []).map((row) => {
      const trainId = byTid.get(String(row.tid || '').trim()) || '';
      return trainId === row.trainId ? row : { ...row, trainId, remark: '' };
    }),
  ]));
  return { ...state, rows };
}

export function summarizeRemovalScan(targetRows, assignments) {
  const byTid = new Map(assignments.filter((row) => row.tid).map((row) => [row.tid, row.trainId]));
  const tids = new Set(targetRows.map((row) => row.tid).filter(Boolean));
  return {
    matched: [...tids].filter((tid) => byTid.has(tid)).length,
    cleared: targetRows.filter((row) => row.trainId && !byTid.has(row.tid)).length,
    unmatched: [...byTid.keys()].filter((tid) => !tids.has(tid)),
  };
}

export function removalScanFingerprint(state, timetableKey = '') {
  return JSON.stringify({ timetableKey, selectedPreset: state.selectedPreset, rows: state.rows });
}

export function applyRemovalImageAssignments(state, assignments, { partial = false } = {}) {
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
  const targetTids = new Set(['west', 'east'].flatMap((depot) => (state.rows?.[depot] || []).map((row) => String(row.tid || '').trim())));
  const assignedTrains = new Set([...byTid].filter(([tid]) => targetTids.has(tid)).map(([, trainId]) => trainId));
  const rows = Object.fromEntries(['west', 'east'].map((depot) => [depot,
    (state.rows?.[depot] || []).map((row) => {
      const tid = String(row.tid || '').trim();
      if (partial && !byTid.has(tid)) {
        if (assignedTrains.has(row.trainId)) throw new Error(`Train ${row.trainId} is also assigned outside this cropped photo. Include the complete table to resolve it.`);
        return row;
      }
      const trainId = byTid.get(tid) || '';
      return trainId === row.trainId ? row : { ...row, trainId, remark: '' };
    }),
  ]));
  return { ...state, rows };
}

export function summarizeRemovalScan(targetRows, assignments, { partial = false } = {}) {
  const byTid = new Map(assignments.filter((row) => row.tid).map((row) => [row.tid, row.trainId]));
  const tids = new Set(targetRows.map((row) => row.tid).filter(Boolean));
  return {
    matched: [...tids].filter((tid) => byTid.has(tid)).length,
    cleared: partial ? 0 : targetRows.filter((row) => row.trainId && !byTid.has(row.tid)).length,
    unmatched: [...byTid.keys()].filter((tid) => !tids.has(tid)),
  };
}

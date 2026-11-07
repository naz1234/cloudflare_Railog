export const INSERTION_ROADS = { west: ['WD-ST15', 'WD-ST14', 'WD-ST13', 'WD-ST12'], east: ['ED-ST02', 'ED-ST03'] };
const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
export const sameInsertionValue = (left, right) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

export function normalizeInsertionSharedState(source = {}) {
  const state = {
    insertionLog: Array.isArray(source?.insertionLog) ? source.insertionLog : [],
    tidInputs: source?.tidInputs || {}, activePg: typeof source?.activePg === 'string'
      ? { west: source.activePg === 'pg2' ? 'pg2' : 'pg1', east: source.activePg === 'pg2' ? 'pg2' : 'pg1' }
      : { west: 'pg1', east: 'pg1', ...source?.activePg },
    pg2Stabling: { westData: {}, eastData: {} },
    pg2InsertionLog: Array.isArray(source?.pg2InsertionLog) ? source.pg2InsertionLog : [],
    pg2TidInputs: source?.pg2TidInputs || {},
  };
  for (const [depot, roads] of Object.entries(INSERTION_ROADS)) {
    const data = source?.pg2Stabling?.[`${depot}Data`] || source?.[`pg2${depot === 'west' ? 'West' : 'East'}Data`] || {};
    for (const road of roads) state.pg2Stabling[`${depot}Data`][road] = Array.from({ length: 7 }, (_, i) => ({
      trainId: String(data[road]?.[i]?.trainId || ''), extraRemark: String(data[road]?.[i]?.extraRemark || ''),
    }));
  }
  return structuredClone(state);
}

export function flattenInsertionState(source) {
  const state = normalizeInsertionSharedState(source);
  const fields = {};
  for (const [depot, roads] of Object.entries(INSERTION_ROADS)) {
    fields[`activePg.${depot}`] = state.activePg[depot];
    for (const road of roads) for (let i = 0; i < 7; i++) {
      fields[`pg2Stabling.${depot}Data.${road}.${i}`] = state.pg2Stabling[`${depot}Data`][road][i];
    }
  }
  for (const field of ['tidInputs', 'pg2TidInputs']) for (const [key, value] of Object.entries(state[field])) fields[`${field}.${key}`] = value;
  for (const field of ['insertionLog', 'pg2InsertionLog']) for (const entry of state[field]) if (entry?.key) fields[`${field}.${entry.key}`] = entry;
  return fields;
}

export function diffInsertionState(before, after) {
  const left = flattenInsertionState(before), right = flattenInsertionState(after);
  return Object.fromEntries([...new Set([...Object.keys(left), ...Object.keys(right)])]
    .filter((key) => !sameInsertionValue(left[key], right[key]))
    .map((key) => [key, own(right, key) ? right[key] : null]));
}

export function insertionFieldDepot(key, value) {
  if (key === 'activePg.east' || key.startsWith('pg2Stabling.eastData.') || /(?:^|[.\-])ED-ST/.test(key) || value?.depot === 'east' || String(value?.road || '').startsWith('ED-')) return 'east';
  return 'west';
}

export function insertionCellPath(key) {
  if (key.startsWith('pg2Stabling.')) return key;
  const cell = key.match(/^(?:pg2TidInputs\.|pg2InsertionLog\.ins-)(WD-ST1[2-5]|ED-ST0[23])-([0-6])$/);
  return cell ? `pg2Stabling.${cell[1].startsWith('ED') ? 'east' : 'west'}Data.${cell[1]}.${cell[2]}` : null;
}

export function validateInsertionChanges(changes) {
  if (!changes || Array.isArray(changes) || typeof changes !== 'object' || Object.keys(changes).length > 1024) throw new Error('Invalid insertion changes.');
  for (const [key, value] of Object.entries(changes)) {
    const cell = key.match(/^pg2Stabling\.(west|east)Data\.(WD-ST1[2-5]|ED-ST0[23])\.([0-6])$/);
    const input = key.match(/^(?:pg2TidInputs|tidInputs)\.(WD-ST1[2-5]|ED-ST0[23])-[0-6]$/);
    const log = key.match(/^(?:pg2InsertionLog|insertionLog)\.([A-Za-z0-9_-]{1,120})$/);
    if (cell) {
      if (!INSERTION_ROADS[cell[1]].includes(cell[2]) || !value || typeof value.trainId !== 'string' || value.trainId.length > 32 || typeof value.extraRemark !== 'string' || value.extraRemark.length > 2048 || Object.keys(value).some((name) => !['trainId', 'extraRemark'].includes(name))) throw new Error('Invalid insertion train cell.');
    } else if (input) {
      if (value !== null && (typeof value !== 'string' || value.length > 2048)) throw new Error('Invalid tracking ID or remark.');
    } else if (log) {
      if (value !== null && (typeof value !== 'object' || Array.isArray(value) || value.key !== log[1] || JSON.stringify(value).length > 20000)) throw new Error('Invalid insertion log entry.');
    } else if (/^activePg\.(west|east)$/.test(key)) {
      if (!['pg1', 'pg2'].includes(value)) throw new Error('Invalid insertion view.');
    } else throw new Error('Unsupported insertion field.');
  }
  return changes;
}

export function applyInsertionChanges(source, changes) {
  validateInsertionChanges(changes);
  const state = normalizeInsertionSharedState(source);
  for (const [key, value] of Object.entries(changes)) {
    const [field, name, road, index] = key.split('.');
    if (field === 'pg2Stabling') state.pg2Stabling[name][road][Number(index)] = structuredClone(value);
    else if (field === 'activePg') state.activePg[name] = value;
    else if (field === 'tidInputs' || field === 'pg2TidInputs') {
      if (value === null) delete state[field][name]; else state[field][name] = value;
    } else {
      const entries = state[field].filter((entry) => entry.key !== name);
      if (value !== null) entries.push(structuredClone(value));
      state[field] = entries;
    }
  }
  return state;
}

import { applyInsertionChanges, diffInsertionState, flattenInsertionState, insertionCellPath, insertionFieldDepot, INSERTION_ROADS, normalizeInsertionSharedState, sameInsertionValue, validateInsertionChanges } from '../../shared/insertion-sync.js';

export const INSERTION_SYNC_CACHE = 'insertionProtectedSync_v2';
export const INSERTION_SYNC_BACKUP = 'insertionBeforeProtectedSync_v2';
export const INSERTION_SYNC_OUTBOX = 'insertionProtectedOutbox_v2:';

export function createInsertionTransport(fetcher = globalThis.fetch, timeoutMs = 15000) {
  const request = async (body) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher('/api/insertion-live', {
        method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await response.json();
      if (!response.ok) {
        const error = new Error(data?.error || 'Insertion sync failed.');
        error.status = response.status; error.snapshot = data?.snapshot;
        throw error;
      }
      return data;
    } finally { clearTimeout(timeout); }
  };
  return { load: () => request(), save: (revision, changes) => request({ revision, changes }) };
}

function validateSnapshot(snapshot) {
  if (!Number.isSafeInteger(snapshot?.revision) || snapshot.revision < 0 || !snapshot.state?.pg2Stabling?.westData
    || !snapshot.state?.pg2Stabling?.eastData || !Array.isArray(snapshot.state.pg2InsertionLog)
    || !Array.isArray(snapshot.state.insertionLog) || !snapshot.state.tidInputs || !snapshot.state.pg2TidInputs || !snapshot.state.activePg) throw new Error('Invalid insertion save response. Pending changes are kept.');
  for (const [depot, roads] of Object.entries(INSERTION_ROADS)) for (const road of roads) {
    const blocks = snapshot.state.pg2Stabling[`${depot}Data`][road];
    if (!Array.isArray(blocks) || blocks.length !== 7 || blocks.some((block) => typeof block?.trainId !== 'string' || typeof block?.extraRemark !== 'string')) throw new Error('Incomplete insertion save response. Pending changes are kept.');
  }
}
function cachedJson(storage, key) { try { return JSON.parse(storage?.getItem(key) || 'null'); } catch { return null; } }

export function createInsertionSyncController({ transport, storage, initialState, debounceMs = 600, schedule = setTimeout, cancel = clearTimeout }) {
  const cached = cachedJson(storage, INSERTION_SYNC_CACHE);
  let state = normalizeInsertionSharedState(cached?.version === 2 ? cached.state : initialState);
  let remote = { revision: -1, state: normalizeInsertionSharedState({}), updatedAt: null };
  const pending = new Map(), listeners = new Set();
  let sequence = 0, ready = false, loading = null, saving = null, timer = null, stopped = false, retryCount = 0, view;
  const actor = globalThis.crypto.randomUUID();
  const retire = (entry) => {
    try { for (const id of [entry.id, ...(entry.previousIds || [])]) if (id) storage?.removeItem?.(INSERTION_SYNC_OUTBOX + id); } catch { /* Keep the browser backup if storage is blocked. */ }
  };
  try {
    const recovered = cached?.version === 2 && cached.pending ? Object.entries(cached.pending) : [];
    // Each operation has its own immutable ID/key. A clean tab cannot erase
    // another tab's unsaved outbox by replacing the shared display cache.
    for (let i = 0; i < (storage?.length || 0); i++) {
      const key = storage.key(i);
      if (key?.startsWith(INSERTION_SYNC_OUTBOX)) {
        const saved = cachedJson(storage, key);
        if (saved?.key && saved?.entry?.id) recovered.push([saved.key, saved.entry]);
      }
    }
    recovered.sort((a, b) => (a[1].createdAt || 0) - (b[1].createdAt || 0) || (a[1].sequence || 0) - (b[1].sequence || 0));
    const seen = new Set();
    for (const [key, entry] of recovered) {
      validateInsertionChanges({ [key]: entry.value });
      if (entry.id && seen.has(entry.id)) continue;
      if (entry.id) seen.add(entry.id);
      const previous = pending.get(key);
      pending.set(key, { ...entry, id: entry.id || globalThis.crypto.randomUUID(), sequence: ++sequence,
        previousIds: [...new Set([...(entry.previousIds || []), ...(previous ? [previous.id, ...(previous.previousIds || [])] : [])])],
        localConflict: Boolean(entry.localConflict || previous?.localConflict || (previous && previous.actor !== entry.actor && !sameInsertionValue(previous.value, entry.value))) });
    }
    if (!storage?.getItem(INSERTION_SYNC_BACKUP)) storage?.setItem(INSERTION_SYNC_BACKUP, JSON.stringify(initialState));
  } catch { /* A blocked browser store does not block shared saving. */ }
  const changes = () => Object.fromEntries([...pending].map(([key, entry]) => [key, entry.value]));
  const persist = () => {
    try {
      for (const [key, entry] of pending) storage?.setItem(INSERTION_SYNC_OUTBOX + entry.id, JSON.stringify({ key, entry }));
      storage?.setItem(INSERTION_SYNC_CACHE, JSON.stringify({ version: 2, state, pending: Object.fromEntries(pending) }));
    } catch { /* Keep edits in memory if storage is blocked. */ }
  };
  const publish = (phase = 'saved', error = '') => {
    const depots = {};
    for (const depot of ['west', 'east']) {
      const entries = [...pending].filter(([key, entry]) => insertionFieldDepot(key, entry.value || entry.base) === depot);
      const conflict = entries.some(([, entry]) => entry.conflict);
      depots[depot] = { phase: !ready ? phase : entries.length ? conflict ? 'failed' : phase : 'saved',
        error: conflict ? 'Changed in another session. Your input is kept; review the shared version before replacing it.' : entries.length || !ready ? error : '', conflict };
    }
    view = { state, depots, ready, updatedAt: remote.updatedAt, pending: pending.size };
    for (const listener of listeners) listener(view);
  };
  const receive = (snapshot) => {
    validateSnapshot(snapshot);
    if (snapshot.revision < remote.revision) return;
    remote = { ...snapshot, state: normalizeInsertionSharedState(snapshot.state) };
    const fields = flattenInsertionState(remote.state);
    const desiredCells = new Map([...pending].filter(([key]) => key.startsWith('pg2Stabling.')).map(([key, entry]) => [key, entry.value]));
    for (const [key, entry] of pending) {
      const guardConflict = entry.guardKey && !sameInsertionValue(fields[entry.guardKey], entry.guard)
        && !sameInsertionValue(fields[entry.guardKey], desiredCells.get(entry.guardKey));
      if (!entry.localConflict && !guardConflict && sameInsertionValue(fields[key], entry.value)) { pending.delete(key); retire(entry); } // Includes a lost successful acknowledgement.
      else entry.conflict = Boolean(entry.localConflict || guardConflict || !sameInsertionValue(fields[key], entry.base));
    }
    // A train, its TID and its log are one unit; never save half a conflicted cell.
    const conflictedCells = new Set([...pending].filter(([, entry]) => entry.conflict).map(([key]) => insertionCellPath(key)).filter(Boolean));
    for (const [key, entry] of pending) if (conflictedCells.has(insertionCellPath(key))) entry.conflict = true;
    state = applyInsertionChanges(remote.state, changes());
    ready = true;
    persist();
  };
  const queueTimer = (delay) => {
    if (timer !== null) cancel(timer);
    if (!stopped) timer = schedule(() => { timer = null; void flush(); }, delay);
  };
  const failed = (error) => {
    const retryable = ![400, 401, 403, 413].includes(error.status);
    const message = (error.message || 'Save failed.') + (retryable ? ' Input kept; retrying automatically.' : ' Input kept.');
    persist(); publish('failed', message);
    if (retryable) queueTimer(Math.min(30000, 2000 * 2 ** Math.min(retryCount++, 4)));
  };
  const refresh = () => {
    if (saving) return saving;
    if (loading) return loading;
    loading = (async () => {
      try {
        const snapshot = await transport.load();
        validateSnapshot(snapshot);
        // Seed an actually empty cloud only. Existing shared/legacy data wins over stale local storage.
        if (!ready && snapshot.revision === 0 && !snapshot.updatedAt && !pending.size) {
          const initial = diffInsertionState(normalizeInsertionSharedState({}), state);
          const fields = flattenInsertionState(snapshot.state);
          for (const [key, value] of Object.entries(initial)) pending.set(key, { value, base: fields[key] ?? null, sequence: ++sequence,
            id: globalThis.crypto.randomUUID(), actor, createdAt: Date.now() });
        }
        receive(snapshot);
        publish(pending.size ? 'pending' : 'saved');
        if (pending.size) queueTimer(debounceMs);
      } catch (error) { failed(error); }
      finally { loading = null; }
    })();
    return loading;
  };
  const flush = () => {
    if (saving) return saving;
    if (timer !== null) { cancel(timer); timer = null; }
    saving = (async () => {
      if (loading) await loading;
      try {
        // A fresh read also resolves replies lost after a successful write.
        receive(await transport.load());
        let conflicts = 0;
        while (pending.size) {
          const sent = new Map([...pending].filter(([, entry]) => !entry.conflict));
          if (!sent.size) { publish('failed'); return; }
          publish('saving');
          try {
            const snapshot = await transport.save(remote.revision, Object.fromEntries([...sent].map(([key, entry]) => [key, entry.value])));
            validateSnapshot(snapshot);
            if (snapshot.revision <= remote.revision) throw new Error('Invalid insertion save acknowledgement.');
            const fields = flattenInsertionState(snapshot.state);
            for (const [key, entry] of sent) {
              if (!sameInsertionValue(fields[key], entry.value)) throw new Error('Insertion save was not confirmed.');
            }
            for (const [key, entry] of sent) {
              const latest = pending.get(key);
              if (latest?.sequence === entry.sequence) { pending.delete(key); retire(entry); }
              else if (latest) latest.base = entry.value; // A newer keystroke follows our own acknowledged write.
            }
            receive(snapshot);
            retryCount = 0; conflicts = 0;
          } catch (error) {
            if (error.status === 409 && error.snapshot && ++conflicts <= 4) { receive(error.snapshot); continue; }
            throw error;
          }
        }
        publish('saved');
      } catch (error) { failed(error); }
    })().finally(() => { saving = null; });
    return saving;
  };
  publish('loading');
  return {
    getView: () => view,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    update(next) {
      const patch = diffInsertionState(state, next), fields = flattenInsertionState(remote.state), previousFields = flattenInsertionState(state);
      if (!Object.keys(patch).length) return;
      for (const [key, value] of Object.entries(patch)) if (key.startsWith('pg2Stabling.') && previousFields[key]?.trainId !== value?.trainId) {
        const [, , road, index] = key.split('.');
        patch[`pg2TidInputs.${road}-${index}`] = next.pg2TidInputs?.[`${road}-${index}`] ?? null;
        patch[`pg2InsertionLog.ins-${road}-${index}`] = next.pg2InsertionLog?.find((entry) => entry.key === `ins-${road}-${index}`) ?? null;
      }
      validateInsertionChanges(patch);
      for (const [key, value] of Object.entries(patch)) {
        const guardKey = insertionCellPath(key);
        const previous = pending.get(key);
        pending.set(key, { value, base: pending.has(key) ? pending.get(key).base : fields[key] ?? null,
          guardKey, guard: guardKey ? previousFields[guardKey] : null, sequence: ++sequence,
          id: globalThis.crypto.randomUUID(), actor, createdAt: Date.now(),
          previousIds: previous ? [previous.id, ...(previous.previousIds || [])] : [], localConflict: previous?.localConflict || false });
      }
      state = normalizeInsertionSharedState(next);
      persist(); publish('pending'); queueTimer(debounceMs);
    },
    async useShared(depot) {
      try {
        receive(await transport.load());
        for (const [key, entry] of pending) if (insertionFieldDepot(key, entry.value || entry.base) === depot) { pending.delete(key); retire(entry); }
        state = applyInsertionChanges(remote.state, changes());
        persist(); publish(pending.size ? 'pending' : 'saved');
      } catch (error) { failed(error); }
    },
    refresh, flush,
    start() { stopped = false; },
    stop() { stopped = true; if (timer !== null) { cancel(timer); timer = null; } },
  };
}

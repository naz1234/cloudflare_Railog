import { applyOdoChanges, diffOdoState, emptyOdoState, hasOdoData, normalizeOdoState, ODO_TRAINSETS, validateCmmsReport, validateOdoChanges } from "../../shared/odo-reading.js";

export const ODO_CACHE_KEY = "odoReadingShared_v2";
export const ODO_LEGACY_KEY = "odoReadingState_v1";
export const ODO_BACKUP_KEY = "odoReadingBeforeShared_v1";

export function createOdoTransport(fetcher = globalThis.fetch, timeoutMs = 15_000) {
  const request = async (body) => {
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher("/api/odo-reading", {
        method: body ? "POST" : "GET", credentials: "same-origin", cache: "no-store", signal: controller.signal,
        headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await response.json();
      if (!response.ok) {
        const error = new Error(data?.error || "Shared ODO storage is unavailable.");
        error.status = response.status;
        error.snapshot = data?.snapshot;
        throw error;
      }
      return data;
    } finally { clearTimeout(deadline); }
  };
  return { load: () => request(), save: (revision, changes) => request({ revision, changes }) };
}

function readCache(storage, key) {
  try { return JSON.parse(storage?.getItem(key) || "null"); } catch { return null; }
}

function validateSnapshot(snapshot) {
  if (!Number.isSafeInteger(snapshot?.revision) || snapshot.revision < 0 || !snapshot.state
    || ODO_TRAINSETS.some((train) => typeof snapshot.state.mileages?.[train] !== "string"
      || !/^\d{0,6}$/.test(snapshot.state.mileages[train]) || typeof snapshot.state.workshops?.[train] !== "boolean")) {
    throw new Error("Invalid shared ODO response.");
  }
  validateCmmsReport(snapshot.state.cmmsReport);
}

export function createOdoSyncController({ transport, storage, debounceMs = 600, schedule = setTimeout, cancel = clearTimeout }) {
  const cached = readCache(storage, ODO_CACHE_KEY);
  const legacy = readCache(storage, ODO_LEGACY_KEY);
  const validCache = cached?.version === 2 && cached?.state && typeof cached.state === "object";
  let state = normalizeOdoState(validCache ? cached.state : legacy);
  let migration = validCache && hasOdoData(cached.migration) ? normalizeOdoState(cached.migration)
    : !validCache && hasOdoData(state) ? state : null;
  let remote = { revision: -1, updatedAt: null, state: emptyOdoState() };
  let sequence = 0;
  const pending = new Map();
  try {
    if (validCache && cached.pending && Object.keys(cached.pending).length) {
      for (const [key, value] of Object.entries(validateOdoChanges(cached.pending))) {
        pending.set(key, { value, sequence: ++sequence, migration: Array.isArray(cached.migrationKeys) && cached.migrationKeys.includes(key) });
      }
    }
  } catch { /* Ignore malformed queued cache entries. */ }
  let ready = false;
  let loading = null;
  let saving = null;
  let timer = null;
  let backupAvailable = false;
  let view;
  const listeners = new Set();
  const changes = () => Object.fromEntries([...pending].map(([key, entry]) => [key, entry.value]));
  const publish = (phase, error = "") => {
    view = { state, phase, error, ready, updatedAt: remote.updatedAt, backupAvailable };
    for (const listener of listeners) listener(view);
  };
  const persist = () => {
    try {
      if (!storage) throw new Error("Browser storage unavailable");
      storage.setItem(ODO_CACHE_KEY, JSON.stringify({ version: 2, state, pending: changes(), migration,
        migrationKeys: [...pending].filter(([, entry]) => entry.migration).map(([key]) => key) }));
      storage.setItem(ODO_LEGACY_KEY, JSON.stringify(state));
      backupAvailable = true;
    } catch { backupAvailable = false; }
  };
  // Retain the pre-sync values before a cloud snapshot can replace this browser's cache.
  if (migration) {
    try {
      if (!storage?.getItem(ODO_BACKUP_KEY)) storage?.setItem(ODO_BACKUP_KEY, JSON.stringify(migration));
    } catch { /* A blocked browser store must not prevent loading shared data. */ }
  }
  const receive = (snapshot) => {
    validateSnapshot(snapshot);
    if (snapshot.revision < remote.revision) return;
    // A different laptop may have seeded the cloud first. Never replace that
    // snapshot with an automatic legacy import; explicit new edits still win.
    if (snapshot.revision > 0 && remote.revision < 1) {
      for (const [key, entry] of pending) if (entry.migration) pending.delete(key);
    }
    remote = { revision: snapshot.revision, updatedAt: snapshot.updatedAt || null, state: normalizeOdoState(snapshot.state) };
    state = applyOdoChanges(remote.state, changes());
    persist();
  };
  const addChanges = (patch) => {
    for (const [key, value] of Object.entries(patch)) pending.set(key, { value, sequence: ++sequence });
  };
  const scheduleSave = () => {
    if (timer !== null) cancel(timer);
    timer = schedule(() => { timer = null; void flush(); }, debounceMs);
  };

  const refresh = () => {
    if (saving) return saving;
    if (loading) return loading;
    loading = (async () => {
      try {
        const snapshot = await transport.load();
        if (migration && snapshot.revision === 0) {
          const initial = diffOdoState(emptyOdoState(), migration);
          // An edit made while loading is newer than the original browser copy.
          for (const [key, value] of Object.entries(initial)) {
            if (!pending.has(key)) pending.set(key, { value, sequence: ++sequence, migration: true });
          }
        }
        receive(snapshot);
        migration = null;
        persist();
        ready = true;
        publish(pending.size ? "pending" : "synced");
        if (pending.size) scheduleSave();
      } catch (error) {
        publish("offline", error.message || "Could not load shared ODO data.");
      } finally { loading = null; }
    })();
    return loading;
  };

  const flush = () => {
    if (saving) return saving;
    if (timer !== null) { cancel(timer); timer = null; }
    saving = (async () => {
      // Do not write until the cloud has been read successfully at least once.
      if (loading) await loading;
      if (!ready) {
        try {
          const snapshot = await transport.load();
          if (migration && snapshot.revision === 0) {
            for (const [key, value] of Object.entries(diffOdoState(emptyOdoState(), migration))) {
              if (!pending.has(key)) pending.set(key, { value, sequence: ++sequence, migration: true });
            }
          }
          receive(snapshot);
          migration = null;
          persist();
          ready = true;
        } catch (error) { publish("offline", error.message); return; }
      }
      let conflicts = 0;
      while (pending.size) {
        const sent = new Map(pending);
        publish("saving");
        try {
          const snapshot = await transport.save(remote.revision, Object.fromEntries([...sent].map(([key, entry]) => [key, entry.value])));
          // Validate before acknowledging edits, so a malformed reply cannot lose them.
          validateSnapshot(snapshot);
          if (snapshot.revision <= remote.revision) throw new Error("Invalid shared ODO save response.");
          for (const [key, entry] of sent) {
            if (pending.get(key)?.sequence === entry.sequence) pending.delete(key);
          }
          receive(snapshot);
          conflicts = 0;
        } catch (error) {
          if (error.status === 409 && error.snapshot && ++conflicts <= 3) {
            try { receive(error.snapshot); continue; } catch { /* Keep queued edits if the conflict response is malformed. */ }
          }
          persist();
          publish("offline", error.message || "Could not save shared ODO data.");
          return;
        }
      }
      publish("synced");
    })().finally(() => { saving = null; });
    return saving;
  };

  publish("loading");
  return {
    getView: () => view,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    update(updater) {
      const next = normalizeOdoState(typeof updater === "function" ? updater(state) : updater);
      const patch = diffOdoState(state, next);
      if (!Object.keys(patch).length) return;
      addChanges(patch);
      state = next;
      persist();
      publish("pending");
      scheduleSave();
    },
    clearReadings() {
      const patch = Object.fromEntries(ODO_TRAINSETS.flatMap((train) => [[`mileages.${train}`, ""], [`workshops.${train}`, false]]));
      addChanges(patch);
      state = applyOdoChanges(state, patch);
      persist();
      publish("pending");
      scheduleSave();
    },
    refresh,
    flush,
    stop() { if (timer !== null) { cancel(timer); timer = null; } },
  };
}

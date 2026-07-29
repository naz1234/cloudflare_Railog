export function shouldApplyTrainMovementRemoteSnapshot({
  now = Date.now(),
  localEditUntil = 0,
  localUpdatedMs = 0,
  incomingUpdatedMs = 0,
  pollRevision = 0,
  currentRevision = 0,
  hasUnsavedLocalEdits = false,
  isSaveBusy = false,
  isInputFocused = false,
} = {}) {
  if (isInputFocused || isSaveBusy || hasUnsavedLocalEdits) return false;
  if (pollRevision !== currentRevision) return false;
  if (now < localEditUntil) return false;
  if (localUpdatedMs && (!incomingUpdatedMs || incomingUpdatedMs <= localUpdatedMs)) return false;
  return true;
}

export function getTrainMovementLiveRecordUpdatedMs(record = {}) {
  const value = record?.updated_date
    || record?.updated_at
    || record?.updatedAt
    || record?.created_date
    || record?.created_at
    || record?.createdAt
    || "";
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function selectTrainMovementExcelLiveRecord(records = [], recordKey = "main") {
  const safeRecords = Array.isArray(records) ? records.filter(Boolean) : [];
  const matchingRecords = safeRecords.filter((record) => (
    record?.recordKey === recordKey || record?.stateKey === recordKey
  ));
  const candidates = matchingRecords.length ? matchingRecords : safeRecords;

  return [...candidates].sort((left, right) => {
    const timestampDifference = getTrainMovementLiveRecordUpdatedMs(right)
      - getTrainMovementLiveRecordUpdatedMs(left);
    if (timestampDifference) return timestampDifference;
    return String(right?.id || "").localeCompare(String(left?.id || ""));
  })[0] || null;
}

/**
 * @param {{ entity: any, recordId?: string | null, payload: any, recordKey?: string }} options
 */
export async function upsertTrainMovementLiveRecord({
  entity,
  recordId = null,
  payload,
  recordKey = "main",
}) {
  let resolvedRecordId = recordId;
  let existingRecord = null;

  const updateRecord = async (id) => {
    const updatedRecord = await entity.update(id, payload);
    return {
      recordId: id,
      record: updatedRecord || { ...payload, id },
      created: false,
    };
  };

  if (!resolvedRecordId) {
    const records = await entity.list();
    existingRecord = selectTrainMovementExcelLiveRecord(records, recordKey);
    resolvedRecordId = existingRecord?.id || null;
  }

  if (resolvedRecordId) {
    try {
      return await updateRecord(resolvedRecordId);
    } catch (error) {
      if (Number(error?.status) !== 404) throw error;

      const records = await entity.list();
      existingRecord = selectTrainMovementExcelLiveRecord(records, recordKey);
      resolvedRecordId = existingRecord?.id || null;
      if (resolvedRecordId) return updateRecord(resolvedRecordId);
    }
  }

  const createdRecord = await entity.create(payload);
  return {
    recordId: createdRecord?.id || null,
    record: createdRecord || payload,
    created: true,
  };
}

/**
 * @param {(snapshot: any) => Promise<any>} saveSnapshot
 * @param {(state: { isBusy: boolean, isRunning: boolean, hasQueued: boolean }) => void} [onStateChange]
 */
export function createLatestTrainMovementSaveQueue(saveSnapshot, onStateChange = () => {}) {
  let running = false;
  let queuedSnapshot = null;
  let lastError = null;
  let idleResolvers = [];

  const getState = () => ({
    isBusy: running || queuedSnapshot !== null,
    isRunning: running,
    hasQueued: queuedSnapshot !== null,
  });

  const notify = () => onStateChange(getState());

  const resolveIdle = () => {
    if (running || queuedSnapshot !== null) return;
    const resolvers = idleResolvers;
    idleResolvers = [];
    resolvers.forEach((resolve) => resolve());
  };

  const drain = async () => {
    if (running) return;
    running = true;
    notify();

    try {
      while (queuedSnapshot !== null) {
        const snapshot = queuedSnapshot;
        queuedSnapshot = null;
        notify();

        try {
          await saveSnapshot(snapshot);
          lastError = null;
        } catch (error) {
          lastError = error;
        }
      }
    } finally {
      running = false;
      notify();
      resolveIdle();
      if (queuedSnapshot !== null) void drain();
    }
  };

  return {
    enqueue(snapshot) {
      queuedSnapshot = snapshot;
      notify();
      void drain();
    },
    isBusy() {
      return getState().isBusy;
    },
    getLastError() {
      return lastError;
    },
    whenIdle() {
      if (!getState().isBusy) return Promise.resolve();
      return new Promise((resolve) => idleResolvers.push(resolve));
    },
  };
}

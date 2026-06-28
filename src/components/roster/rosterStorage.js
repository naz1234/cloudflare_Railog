import { base44 } from "../../api/base44Client";

const DB_NAME = "railog-roster-db";
const DB_VERSION = 2;
const STORE_NAME = "rosters";
const LEGACY_ACTIVE_ID = "active";
const CLOUD_VERSION_KEY = "occ-roster-version";
const LEGACY_CLOUD_KEY = "occ-roster-active";

function getRosterEntity() {
  return base44?.entities?.RosterFile || null;
}

function isRosterEntityReady(entity = getRosterEntity()) {
  return Boolean(
    entity
      && typeof entity.filter === "function"
      && typeof entity.create === "function"
      && typeof entity.update === "function"
      && typeof entity.delete === "function"
  );
}

function openRosterDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("This browser does not support persistent roster storage."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open roster storage."));
  });
}

function runTransaction(mode, callback) {
  return openRosterDb().then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    let request;

    try {
      request = callback(store);
    } catch (error) {
      db.close();
      reject(error);
      return;
    }

    transaction.oncomplete = () => {
      const result = request?.result;
      db.close();
      resolve(result);
    };
    transaction.onerror = () => {
      const error = transaction.error || request?.error || new Error("Roster storage operation failed.");
      db.close();
      reject(error);
    };
  }));
}

function makeVersionKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `roster-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getRosterTimeMs(record) {
  const value = record?.uploadedAt
    || record?.createdAt
    || record?.created_date
    || record?.updatedAt
    || record?.updated_date
    || "";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function sortRosterVersions(records = []) {
  return [...(Array.isArray(records) ? records : [])]
    .sort((left, right) => getRosterTimeMs(right) - getRosterTimeMs(left));
}

async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBlob(base64, mimeType = "application/pdf") {
  if (!base64) return null;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType || "application/pdf" });
}

function restoreFile(blob, fileName, mimeType) {
  if (!blob) return null;
  try {
    return new File([blob], fileName || "OCC-Roster.pdf", { type: mimeType || "application/pdf" });
  } catch {
    return blob;
  }
}

function normalizeLocalRecord(record) {
  if (!record) return null;
  const uploadedAt = record.uploadedAt
    || record.createdAt
    || record.created_date
    || record.updatedAt
    || record.updated_date
    || new Date().toISOString();
  const versionKey = record.versionKey
    || record.cloudId
    || (record.id && record.id !== LEGACY_ACTIVE_ID ? record.id : `legacy-${getRosterTimeMs(record) || Date.now()}`);

  return {
    ...record,
    id: versionKey,
    versionKey,
    cloudId: record.cloudId || "",
    cloudSynced: record.cloudSynced !== false,
    syncError: record.syncError || "",
    remark: String(record.remark || "").trim(),
    uploadedAt,
    updatedAt: record.updatedAt || uploadedAt,
  };
}

function buildLocalRecord({ file, parsed, remark = "" }) {
  const now = new Date().toISOString();
  const versionKey = makeVersionKey();
  return {
    id: versionKey,
    versionKey,
    cloudId: "",
    cloudSynced: false,
    syncError: "",
    recordKey: CLOUD_VERSION_KEY,
    fileName: file?.name || "OCC-Roster.pdf",
    mimeType: file?.type || "application/pdf",
    size: Number(file?.size || 0),
    uploadedAt: now,
    updatedAt: now,
    remark: String(remark || "").trim(),
    fileBlob: file || null,
    parsed,
  };
}

function hydrateCloudRecord(record) {
  if (!record) return null;
  const mimeType = record.mimeType || "application/pdf";
  let blob = null;

  try {
    blob = base64ToBlob(record.fileBase64 || "", mimeType);
  } catch (error) {
    console.warn("Unable to restore a roster PDF from Cloudflare D1:", error);
  }

  const uploadedAt = record.uploadedAt
    || record.createdAt
    || record.created_date
    || record.updatedAt
    || record.updated_date
    || new Date().toISOString();
  const versionKey = record.versionKey || record.id || makeVersionKey();

  return {
    id: versionKey,
    versionKey,
    cloudId: record.id || "",
    cloudSynced: true,
    syncError: "",
    recordKey: record.recordKey || CLOUD_VERSION_KEY,
    fileName: record.fileName || "OCC-Roster.pdf",
    mimeType,
    size: Number(record.size || blob?.size || 0),
    uploadedAt,
    updatedAt: record.updatedAt || record.updated_date || uploadedAt,
    remark: String(record.remark || "").trim(),
    fileBlob: restoreFile(blob, record.fileName, mimeType),
    parsed: record.parsed || null,
  };
}

async function readLocalRosters() {
  try {
    const records = await runTransaction("readonly", (store) => store.getAll());
    return sortRosterVersions((records || []).map(normalizeLocalRecord).filter(Boolean));
  } catch (error) {
    console.warn("Unable to read the local roster cache:", error);
    return [];
  }
}

async function writeLocalRoster(record) {
  if (!record) return null;
  const normalized = normalizeLocalRecord(record);
  try {
    await runTransaction("readwrite", (store) => store.put(normalized));
    if (record.id === LEGACY_ACTIVE_ID && normalized.id !== LEGACY_ACTIVE_ID) {
      await runTransaction("readwrite", (store) => store.delete(LEGACY_ACTIVE_ID));
    }
  } catch (error) {
    console.warn("Unable to update the local roster cache:", error);
  }
  return normalized;
}

async function removeLocalRoster(versionKey) {
  if (!versionKey) return;
  try {
    await runTransaction("readwrite", (store) => store.delete(versionKey));
  } catch (error) {
    console.warn("Unable to remove a roster from the local cache:", error);
  }
}

async function replaceLocalRosters(records = []) {
  try {
    await runTransaction("readwrite", (store) => store.clear());
    for (const record of records) {
      await writeLocalRoster(record);
    }
  } catch (error) {
    console.warn("Unable to refresh the local roster cache:", error);
  }
}

async function listCloudRosterRecords() {
  const entity = getRosterEntity();
  if (!isRosterEntityReady(entity)) throw new Error("Roster live storage is not available in this build.");

  const [versions, legacy] = await Promise.all([
    entity.filter({ recordKey: CLOUD_VERSION_KEY }),
    entity.filter({ recordKey: LEGACY_CLOUD_KEY }),
  ]);

  const combined = [...(Array.isArray(versions) ? versions : []), ...(Array.isArray(legacy) ? legacy : [])];
  const byCloudId = new Map();
  combined.forEach((record) => {
    if (record?.id) byCloudId.set(record.id, record);
  });
  return [...byCloudId.values()];
}

async function createRecordInCloud(record) {
  const entity = getRosterEntity();
  if (!isRosterEntityReady(entity)) throw new Error("Roster live storage is not available in this build.");
  if (!record?.fileBlob) throw new Error("The original roster PDF is unavailable for cloud upload.");

  const uploadedAt = record.uploadedAt || new Date().toISOString();
  const payload = {
    recordKey: CLOUD_VERSION_KEY,
    versionKey: record.versionKey || makeVersionKey(),
    fileName: record.fileName || "OCC-Roster.pdf",
    mimeType: record.mimeType || record.fileBlob.type || "application/pdf",
    size: Number(record.size || record.fileBlob.size || 0),
    uploadedAt,
    updatedAt: record.updatedAt || uploadedAt,
    remark: String(record.remark || "").trim(),
    fileBase64: await blobToBase64(record.fileBlob),
    parsed: record.parsed || null,
  };

  const saved = await entity.create(payload);
  return hydrateCloudRecord(saved);
}

function mergeRosterLists(cloudRecords = [], localRecords = []) {
  const map = new Map();

  cloudRecords.forEach((record) => {
    if (record?.versionKey) map.set(record.versionKey, record);
  });

  localRecords.forEach((record) => {
    if (!record?.versionKey) return;
    const existing = map.get(record.versionKey);
    if (!existing || record.cloudSynced === false) {
      map.set(record.versionKey, existing ? { ...record, cloudId: existing.cloudId, cloudSynced: true, syncError: "" } : record);
    }
  });

  return sortRosterVersions([...map.values()]);
}

export async function loadCloudRosters() {
  const rawRecords = await listCloudRosterRecords();
  const records = sortRosterVersions(rawRecords.map(hydrateCloudRecord).filter(Boolean));
  await replaceLocalRosters(records);
  return records;
}

export async function loadSavedRosters() {
  const localRecords = await readLocalRosters();
  let cloudRecords = [];
  let cloudError = null;

  try {
    const rawRecords = await listCloudRosterRecords();
    cloudRecords = sortRosterVersions(rawRecords.map(hydrateCloudRecord).filter(Boolean));
  } catch (error) {
    cloudError = error;
    console.warn("Unable to load shared roster versions from Cloudflare D1:", error);
  }

  if (cloudError) {
    return sortRosterVersions(localRecords.map((record) => ({
      ...record,
      cloudSynced: record.cloudSynced !== false,
      syncError: errorMessage(cloudError),
    })));
  }

  const unsynced = localRecords.filter((record) => record.cloudSynced === false || !record.cloudId);
  const migrated = [];

  for (const record of unsynced) {
    if (!record.fileBlob) continue;
    try {
      migrated.push(await createRecordInCloud(record));
    } catch (error) {
      migrated.push({ ...record, cloudSynced: false, syncError: errorMessage(error) });
    }
  }

  const merged = mergeRosterLists([...cloudRecords, ...migrated.filter((record) => record.cloudSynced !== false)], migrated.filter((record) => record.cloudSynced === false));
  await replaceLocalRosters(merged);
  return merged;
}

function errorMessage(error) {
  return error?.message || "Cloud sync unavailable.";
}

export async function saveRoster({ file, parsed, remark = "" }) {
  const localRecord = buildLocalRecord({ file, parsed, remark });
  await writeLocalRoster(localRecord);

  try {
    const cloudRecord = await createRecordInCloud(localRecord);
    await removeLocalRoster(localRecord.versionKey);
    await writeLocalRoster(cloudRecord);
    return cloudRecord;
  } catch (error) {
    console.warn("Roster cloud save failed; the browser cache remains available:", error);
    const fallback = {
      ...localRecord,
      cloudSynced: false,
      syncError: errorMessage(error),
    };
    await writeLocalRoster(fallback);
    return fallback;
  }
}

export async function updateRosterRemark(record, remark = "") {
  if (!record?.versionKey) throw new Error("Roster version is missing.");
  const updatedAt = new Date().toISOString();
  const cleanRemark = String(remark || "").trim();
  let updated = { ...record, remark: cleanRemark, updatedAt };
  await writeLocalRoster(updated);

  const entity = getRosterEntity();
  if (!isRosterEntityReady(entity)) {
    updated = { ...updated, cloudSynced: false, syncError: "Roster live storage is not available in this build." };
    await writeLocalRoster(updated);
    return updated;
  }

  try {
    if (record.cloudId) {
      const cloudResult = await entity.update(record.cloudId, { remark: cleanRemark, updatedAt });
      updated = hydrateCloudRecord(cloudResult);
    } else {
      updated = await createRecordInCloud(updated);
    }
    await removeLocalRoster(record.versionKey);
    await writeLocalRoster(updated);
    return updated;
  } catch (error) {
    updated = { ...updated, cloudSynced: false, syncError: errorMessage(error) };
    await writeLocalRoster(updated);
    return updated;
  }
}

export async function deleteSavedRoster(record) {
  if (!record?.versionKey) throw new Error("Roster version is missing.");
  await removeLocalRoster(record.versionKey);

  const entity = getRosterEntity();
  if (!record.cloudId) return { cloudDeleted: false, localDeleted: true, error: "This version was only stored locally." };
  if (!isRosterEntityReady(entity)) {
    return { cloudDeleted: false, localDeleted: true, error: "Roster live storage is not available in this build." };
  }

  try {
    await entity.delete(record.cloudId);
    return { cloudDeleted: true, localDeleted: true };
  } catch (error) {
    console.warn("Unable to delete a shared roster version from Cloudflare D1:", error);
    return { cloudDeleted: false, localDeleted: true, error: errorMessage(error) };
  }
}

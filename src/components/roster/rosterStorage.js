import { base44 } from "../../api/base44Client";

const DB_NAME = "railog-roster-db";
const DB_VERSION = 1;
const STORE_NAME = "rosters";
const ACTIVE_ID = "active";
const CLOUD_RECORD_KEY = "occ-roster-active";

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
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "id" });
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

function getRecordUpdatedMs(record) {
  const value = record?.updatedAt || record?.updated_date || record?.createdAt || record?.created_date || "";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickLatestCloudRecord(records = []) {
  return [...(Array.isArray(records) ? records : [])]
    .filter((record) => record?.recordKey === CLOUD_RECORD_KEY)
    .sort((left, right) => getRecordUpdatedMs(right) - getRecordUpdatedMs(left))[0] || null;
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

function buildLocalRecord({ file, parsed, updatedAt = new Date().toISOString(), cloudId = "", cloudSynced = false, syncError = "" }) {
  return {
    id: ACTIVE_ID,
    cloudId,
    cloudSynced,
    syncError,
    fileName: file?.name || "OCC-Roster.pdf",
    mimeType: file?.type || "application/pdf",
    size: Number(file?.size || 0),
    updatedAt,
    fileBlob: file || null,
    parsed,
  };
}

function hydrateCloudRecord(record) {
  if (!record) return null;
  const mimeType = record.mimeType || "application/pdf";
  let fileBlob = null;
  try {
    fileBlob = base64ToBlob(record.fileBase64 || "", mimeType);
  } catch (error) {
    console.warn("Unable to restore the roster PDF blob from Cloudflare D1:", error);
  }

  if (fileBlob && record.fileName) {
    try {
      fileBlob = new File([fileBlob], record.fileName, { type: mimeType });
    } catch {
      // Blob is sufficient for downloading in browsers without the File constructor.
    }
  }

  return {
    id: ACTIVE_ID,
    cloudId: record.id || "",
    cloudSynced: true,
    syncError: "",
    fileName: record.fileName || "OCC-Roster.pdf",
    mimeType,
    size: Number(record.size || fileBlob?.size || 0),
    updatedAt: record.updatedAt || record.updated_date || record.createdAt || record.created_date || new Date().toISOString(),
    fileBlob,
    parsed: record.parsed || null,
  };
}

async function readLocalRoster() {
  try {
    return await runTransaction("readonly", (store) => store.get(ACTIVE_ID));
  } catch (error) {
    console.warn("Unable to read the local roster cache:", error);
    return null;
  }
}

async function writeLocalRoster(record) {
  if (!record) return null;
  try {
    await runTransaction("readwrite", (store) => store.put({ ...record, id: ACTIVE_ID }));
  } catch (error) {
    console.warn("Unable to update the local roster cache:", error);
  }
  return record;
}

async function removeLocalRoster() {
  try {
    await runTransaction("readwrite", (store) => store.delete(ACTIVE_ID));
  } catch (error) {
    console.warn("Unable to remove the local roster cache:", error);
  }
}

async function listCloudRosterRecords() {
  const entity = getRosterEntity();
  if (!isRosterEntityReady(entity)) throw new Error("Roster live storage is not available in this build.");
  return entity.filter({ recordKey: CLOUD_RECORD_KEY });
}

async function saveRecordToCloud(record) {
  const entity = getRosterEntity();
  if (!isRosterEntityReady(entity)) throw new Error("Roster live storage is not available in this build.");
  if (!record?.fileBlob) throw new Error("The original roster PDF is unavailable for cloud upload.");

  const updatedAt = record.updatedAt || new Date().toISOString();
  const payload = {
    recordKey: CLOUD_RECORD_KEY,
    fileName: record.fileName || "OCC-Roster.pdf",
    mimeType: record.mimeType || record.fileBlob.type || "application/pdf",
    size: Number(record.size || record.fileBlob.size || 0),
    updatedAt,
    fileBase64: await blobToBase64(record.fileBlob),
    parsed: record.parsed || null,
  };

  const records = await listCloudRosterRecords();
  const latest = pickLatestCloudRecord(records);
  const saved = latest
    ? await entity.update(latest.id, payload)
    : await entity.create(payload);

  const duplicates = (Array.isArray(records) ? records : []).filter((item) => item?.id && item.id !== latest?.id);
  await Promise.allSettled(duplicates.map((item) => entity.delete(item.id)));

  return hydrateCloudRecord(saved);
}

export async function loadCloudRoster() {
  const records = await listCloudRosterRecords();
  const cloudRecord = hydrateCloudRecord(pickLatestCloudRecord(records));
  if (cloudRecord) await writeLocalRoster(cloudRecord);
  return cloudRecord;
}

export async function loadSavedRoster() {
  const localRecord = await readLocalRoster();
  let cloudRecord = null;
  let cloudError = null;

  try {
    cloudRecord = await loadCloudRoster();
  } catch (error) {
    cloudError = error;
    console.warn("Unable to load the shared roster from Cloudflare D1:", error);
  }

  if (cloudRecord && getRecordUpdatedMs(cloudRecord) >= getRecordUpdatedMs(localRecord)) {
    return cloudRecord;
  }

  if (localRecord) {
    if (!cloudRecord || getRecordUpdatedMs(localRecord) > getRecordUpdatedMs(cloudRecord)) {
      try {
        const migrated = await saveRecordToCloud(localRecord);
        await writeLocalRoster(migrated);
        return migrated;
      } catch (error) {
        console.warn("Unable to migrate the local roster to Cloudflare D1:", error);
        return {
          ...localRecord,
          cloudSynced: false,
          syncError: error?.message || cloudError?.message || "Cloud sync unavailable.",
        };
      }
    }
    return { ...localRecord, cloudSynced: Boolean(cloudRecord), syncError: cloudError?.message || "" };
  }

  return null;
}

export async function saveRoster({ file, parsed }) {
  const updatedAt = new Date().toISOString();
  const localRecord = buildLocalRecord({ file, parsed, updatedAt });
  await writeLocalRoster(localRecord);

  try {
    const cloudRecord = await saveRecordToCloud(localRecord);
    await writeLocalRoster(cloudRecord);
    return cloudRecord;
  } catch (error) {
    console.warn("Roster cloud save failed; the browser cache remains available:", error);
    const fallback = {
      ...localRecord,
      cloudSynced: false,
      syncError: error?.message || "Unable to save the roster to Cloudflare D1.",
    };
    await writeLocalRoster(fallback);
    return fallback;
  }
}

export async function deleteSavedRoster() {
  await removeLocalRoster();

  const entity = getRosterEntity();
  if (!isRosterEntityReady(entity)) {
    return { cloudDeleted: false, error: "Roster live storage is not available in this build." };
  }

  try {
    const records = await listCloudRosterRecords();
    const targets = (Array.isArray(records) ? records : []).filter((record) => record?.id);
    await Promise.all(targets.map((record) => entity.delete(record.id)));
    return { cloudDeleted: true };
  } catch (error) {
    console.warn("Unable to delete the shared roster from Cloudflare D1:", error);
    return { cloudDeleted: false, error: error?.message || "Unable to delete the shared roster." };
  }
}

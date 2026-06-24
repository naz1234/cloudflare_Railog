const DB_NAME = "railog-roster-db";
const DB_VERSION = 1;
const STORE_NAME = "rosters";
const ACTIVE_ID = "active";

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

export function loadSavedRoster() {
  return runTransaction("readonly", (store) => store.get(ACTIVE_ID));
}

export function saveRoster({ file, parsed }) {
  return runTransaction("readwrite", (store) => store.put({
    id: ACTIVE_ID,
    fileName: file.name,
    mimeType: file.type || "application/pdf",
    size: file.size,
    updatedAt: new Date().toISOString(),
    fileBlob: file,
    parsed,
  }));
}

export function deleteSavedRoster() {
  return runTransaction("readwrite", (store) => store.delete(ACTIVE_ID));
}

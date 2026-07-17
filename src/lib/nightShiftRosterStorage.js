import { base44 } from "@/api/base44Client";

const RECORD_KEY = "overtime-night-shift-roster-v1";
const PARSER_VERSION = 1;

// Cloudflare D1 limits a string or complete row to 2,000,000 bytes. Base64
// increases the PDF size by roughly one third, so this leaves room for the
// parsed roster, metadata, and JSON encoding in the same row.
export const MAX_PERSISTED_PDF_SIZE = 1_250_000;

function getRosterEntity() {
  return base44?.entities?.NightShiftRosterFile || null;
}

function requireRosterEntity() {
  const entity = getRosterEntity();
  if (!entity?.filter || !entity?.create || !entity?.update || !entity?.delete) {
    throw new Error("Shared roster storage is unavailable in this build.");
  }
  return entity;
}

function getRecordTime(record = {}) {
  const value = record.updatedAt
    || record.updated_date
    || record.uploadedAt
    || record.createdAt
    || record.created_date
    || "";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortNewest(records = []) {
  return [...(Array.isArray(records) ? records : [])]
    .sort((left, right) => getRecordTime(right) - getRecordTime(left));
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
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType || "application/pdf" });
}

function restoreFile(blob, fileName, mimeType) {
  if (!blob) return null;
  try {
    return new File([blob], fileName || "Night-Shift-Roster.pdf", {
      type: mimeType || "application/pdf",
    });
  } catch {
    return blob;
  }
}

function hydrateRecord(record) {
  if (!record) return null;
  const mimeType = record.mimeType || "application/pdf";
  const blob = base64ToBlob(record.fileBase64 || "", mimeType);
  if (!blob) throw new Error("The saved cloud record does not contain its original PDF.");

  const uploadedAt = record.uploadedAt
    || record.createdAt
    || record.created_date
    || record.updatedAt
    || record.updated_date
    || new Date().toISOString();

  return {
    id: record.id || "",
    recordKey: RECORD_KEY,
    fileName: record.fileName || "Night-Shift-Roster.pdf",
    mimeType,
    size: Number(record.size || blob.size || 0),
    uploadedAt,
    updatedAt: record.updatedAt || record.updated_date || uploadedAt,
    parserVersion: Number(record.parserVersion || 0),
    parsed: record.parsed || null,
    file: restoreFile(blob, record.fileName, mimeType),
  };
}

async function listRawRecords() {
  const entity = requireRosterEntity();
  const records = await entity.filter({ recordKey: RECORD_KEY });
  return sortNewest(records);
}

export async function loadSavedNightShiftRoster() {
  const records = await listRawRecords();
  return records.length ? hydrateRecord(records[0]) : null;
}

export async function saveNightShiftRoster({ file, parsed }) {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new Error("The original PDF is unavailable for cloud storage.");
  }
  if (Number(file.size || 0) > MAX_PERSISTED_PDF_SIZE) {
    throw new Error("This PDF is too large for the shared D1 storage limit.");
  }

  const entity = requireRosterEntity();
  const records = await listRawRecords();
  const existing = records[0] || null;
  const now = new Date().toISOString();
  const payload = {
    recordKey: RECORD_KEY,
    fileName: file.name || "Night-Shift-Roster.pdf",
    mimeType: file.type || "application/pdf",
    size: Number(file.size || 0),
    fileBase64: await blobToBase64(file),
    parsed: parsed || null,
    parserVersion: PARSER_VERSION,
    uploadedAt: now,
    updatedAt: now,
  };

  const saved = existing?.id
    ? await entity.update(existing.id, payload)
    : await entity.create(payload);

  return hydrateRecord(saved);
}

export async function deleteSavedNightShiftRoster() {
  const entity = requireRosterEntity();
  const records = await listRawRecords();

  for (const record of records) {
    if (record?.id) await entity.delete(record.id);
  }

  return { deleted: records.length };
}

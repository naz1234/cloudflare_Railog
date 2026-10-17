const text = (value) => String(value ?? "");

const DEFAULT_ENTRY = {
  picName: "", picId: "", description: "", accessNo: "", issueTime: "",
  accessPoint: "", accessAuthTime: "", scd: "Yes", scdLoc: "",
  scdApplyTime: "", scdRemTime: "", handbackTime: "",
};

export function getPossessionAccessDetails(entry = {}) {
  if (Array.isArray(entry?.accessDetails) && entry.accessDetails.length > 0) {
    return entry.accessDetails.map((detail) => ({
      accessNo: text(detail?.accessNo),
      description: text(detail?.description),
    }));
  }

  // Old entries used one description and slash-separated access numbers.
  // Commas are thousands separators (303,004), not separate access numbers.
  const accessNumbers = text(entry?.accessNo)
    .split(/\s*(?:\/|;|\r?\n|\s+and\s+|&)\s*/i)
    .map((number) => number.trim()).filter(Boolean);
  return (accessNumbers.length ? accessNumbers : [""]).map((accessNo) => ({
    accessNo,
    description: text(entry?.description),
  }));
}

export function getPossessionSecurityDetails(entry = {}, legacyDetails = {}) {
  // An explicit empty object means this entry's details were cleared. Only old
  // entries with no securityDetails field may use the first-entry legacy data.
  const details = Object.hasOwn(entry || {}, "securityDetails") ? entry.securityDetails : legacyDetails;
  return { phone: text(details?.phone), location: text(details?.location), gateNo: text(details?.gateNo) };
}

export function normalizePossessionAccessEntry(value = {}, index = 0) {
  const entry = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const accessDetails = getPossessionAccessDetails(entry);
  return {
    ...DEFAULT_ENTRY,
    ...entry,
    entryId: text(entry.entryId).trim() || `legacy-access-${index + 1}`,
    ...(Object.hasOwn(entry, "securityDetails") ? { securityDetails: getPossessionSecurityDetails(entry) } : {}),
    accessDetails,
    // Retain the legacy fields for older saved records/readers.
    accessNo: accessDetails.map((detail) => detail.accessNo).filter((number) => number.trim()).join(" / "),
    description: accessDetails.map((detail) => detail.description).filter((description) => description.trim()).join("\n"),
  };
}

export function removePossessionAccessEntry(entries, index, legacyDetails = {}) {
  // Materialize legacy details before renumbering. They must not transfer from
  // the old first PIC to a different PIC after that first entry is removed.
  return entries.map((entry, i) => ({
    ...normalizePossessionAccessEntry(entry, i),
    securityDetails: getPossessionSecurityDetails(entry, i === 0 ? legacyDetails : {}),
  })).filter((_, i) => i !== index);
}

function cleanAccessNumber(raw) {
  return text(raw).replace(/,/g, "").trim().replace(/^(?:Access\s*)?#\s*/i, "");
}

export function buildPossessionDashboard(entries = [], validTime = (value) => /^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(text(value).trim())) {
  const pics = new Set();
  const waitingForHandback = new Set();
  const issued = new Map();
  const namedIds = new Map();
  const records = (Array.isArray(entries) ? entries : []).filter((entry) => entry && typeof entry === "object").map((entry) => ({
    entry,
    picId: text(entry.picId).trim().replace(/\s+/g, "").toUpperCase(),
    picName: text(entry.picName).trim().replace(/\s+/g, " ").toUpperCase(),
  }));
  for (const { picId, picName } of records) {
    if (!picId || !picName) continue;
    if (!namedIds.has(picName)) namedIds.set(picName, new Set());
    namedIds.get(picName).add(picId);
  }
  for (const { entry, picId, picName } of records) {
    const knownIds = namedIds.get(picName);
    const identity = picId || (knownIds?.size === 1 ? [...knownIds][0] : "");
    const picKey = identity ? `id:${identity}` : picName ? `name:${picName}` : "";
    if (picKey) pics.add(picKey);
    if (!validTime(entry.issueTime)) continue;
    const handedBack = Boolean(validTime(entry.handbackTime));
    let hasIssuedAccess = false;
    for (const detail of getPossessionAccessDetails(entry)) {
      for (const number of getPossessionAccessDetails({ accessNo: detail.accessNo })) {
        const key = cleanAccessNumber(number.accessNo).replace(/\s+/g, "").toUpperCase();
        if (!key) continue;
        hasIssuedAccess = true;
        // A repeated permit is counted once, and stays open while any issued
        // record for that number still has no valid handback time.
        issued.set(key, (issued.get(key) ?? true) && handedBack);
      }
    }
    if (picKey && hasIssuedAccess && !handedBack) waitingForHandback.add(picKey);
  }
  return { issued: issued.size, pics: pics.size, handedBack: [...issued.values()].filter(Boolean).length, waitingForHandback: waitingForHandback.size };
}

// Shared details always come from the corresponding access entry, never the old
// separately saved security form. Only its phone/location/gate remain manual.
export function buildPossessionSecurityMessage(entry, details = getPossessionSecurityDetails(entry)) {
  const f = normalizePossessionAccessEntry(entry);
  const picName = text(f.picName).trim();
  const accessDetails = f.accessDetails.map((detail) => ({
    accessNo: cleanAccessNumber(detail.accessNo),
    description: detail.description.trim(),
  })).filter((detail) => detail.accessNo || detail.description);
  if (!picName && !accessDetails.length) return "";

  const access = accessDetails.map((detail) => detail.accessNo).filter(Boolean).join(" / ");
  const activity = accessDetails.length > 1
    ? accessDetails.map((detail) => `${detail.accessNo ? `Access #${detail.accessNo}` : ""}${detail.accessNo && detail.description ? " – " : ""}${detail.description}`).join("\n")
    : accessDetails[0]?.description || "";
  return [
    `PIC Name: ${picName}`,
    `Mobile#: ${text(details?.phone).trim()}`,
    `Access: ${access}`,
    `Activity:${accessDetails.length > 1 ? "\n" : " "}${activity}`,
    `Location: ${text(details?.location).trim()}`,
    `Gate Number: ${text(details?.gateNo).trim()}`,
  ].join("\n");
}

function formatAccessReferences(numbers) {
  const references = numbers.map((number) => `#${number}`);
  if (references.length < 3) return `Access ${references.join(" and ")}`;
  return `Access ${references.slice(0, -1).join(", ")} and ${references.at(-1)}`;
}

function getTimedLineMinutes(line) {
  const match = line.match(/^(\d{2}):(\d{2}) hrs/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : Infinity;
}

export function buildPossessionEntryOutput(entry, formatTime) {
  const f = normalizePossessionAccessEntry(entry);
  const header = [];
  const events = [];
  const picName = text(f.picName).trim();
  const picId = text(f.picId).trim();
  if (picName || picId) header.push(`PIC - ${picName}${picId ? ` (${picId})` : ""}`);

  const accessNumbers = [];
  for (const detail of f.accessDetails) {
    const number = cleanAccessNumber(detail.accessNo);
    const description = detail.description.trim();
    if (number) {
      accessNumbers.push(number);
      header.push(`Access #${number}${description ? ` – ${description}` : ""}`);
    } else if (description) {
      header.push(description);
    }
  }

  const accessPoint = text(f.accessPoint).trim();
  const accessAuthT = formatTime(f.accessAuthTime);
  if (f.scd !== "No" && accessAuthT && accessPoint) {
    events.push(`${accessAuthT} – PIC${picName ? ` ${picName}` : ""} authorized to access ${accessPoint} and start apply the SCD.`);
  }
  if (f.scd === "Yes" && (f.scdApplyTime || f.scdRemTime || f.scdLoc)) {
    const applyT = formatTime(f.scdApplyTime);
    const remT = formatTime(f.scdRemTime);
    // Separate events so an issue/handback time can fall between application and removal.
    if (applyT) events.push(`${applyT} - SCD applied${f.scdLoc ? ` at ${f.scdLoc}` : ""}.`);
    if (remT) events.push(`${remT} - SCD confirmed removed.`);
  }
  const accessReferences = formatAccessReferences(accessNumbers);
  const issueT = formatTime(f.issueTime);
  if (issueT && accessNumbers.length) events.push(`${issueT} - CMMS updated to ISSUED (${accessReferences})`);
  const handbackT = formatTime(f.handbackTime);
  if (handbackT && accessNumbers.length) events.push(`${handbackT} - CMMS updated to COMP (${accessReferences})`);
  // Stable ascending 24-hour order; equal-time events retain their original order.
  events.sort((left, right) => getTimedLineMinutes(left) - getTimedLineMinutes(right));
  return [header.join("\n"), events.join("\n")].filter(Boolean).join("\n\n");
}

export function buildPossessionCombinedOutput(entries = [], formatTime) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => buildPossessionEntryOutput(entry, formatTime))
    .filter((output) => output.trim())
    .join(`\n\n${"─".repeat(36)}\n\n`);
}

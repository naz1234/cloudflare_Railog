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

export function normalizePossessionAccessEntry(value = {}) {
  const entry = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const accessDetails = getPossessionAccessDetails(entry);
  return {
    ...DEFAULT_ENTRY,
    ...entry,
    accessDetails,
    // Retain the legacy fields for older saved records/readers.
    accessNo: accessDetails.map((detail) => detail.accessNo).filter((number) => number.trim()).join(" / "),
    description: accessDetails.map((detail) => detail.description).filter((description) => description.trim()).join("\n"),
  };
}

function cleanAccessNumber(raw) {
  return text(raw).replace(/,/g, "").trim().replace(/^(?:Access\s*)?#\s*/i, "");
}

function formatAccessReferences(numbers) {
  const references = numbers.map((number) => `#${number}`);
  if (references.length < 3) return `Access ${references.join(" and ")}`;
  return `Access ${references.slice(0, -1).join(", ")} and ${references.at(-1)}`;
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
    let scdLine = "";
    if (applyT) scdLine += `${applyT} - SCD applied${f.scdLoc ? ` at ${f.scdLoc}` : ""}.`;
    if (remT) scdLine += ` At ${remT} SCD confirmed removed.`;
    if (scdLine) events.push(scdLine.trim());
  }
  const accessReferences = formatAccessReferences(accessNumbers);
  const issueT = formatTime(f.issueTime);
  if (issueT && accessNumbers.length) events.push(`${issueT} - CMMS updated to ISSUED (${accessReferences})`);
  const handbackT = formatTime(f.handbackTime);
  if (handbackT && accessNumbers.length) events.push(`${handbackT} - CMMS updated to COMP (${accessReferences})`);
  return [header.join("\n"), events.join("\n")].filter(Boolean).join("\n\n");
}

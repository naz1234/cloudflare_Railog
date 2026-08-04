const ACTION_DEFINITIONS = [
  {
    value: "needSwapping",
    label: "Need Swapping",
    group: "swap",
    actionType: "",
    actionSymbol: "⇆",
  },
  {
    value: "earlyShiftRem",
    label: "Early Shift Rem",
    group: "removal",
    actionType: "earlyShiftRem",
    actionSymbol: "✓",
  },
  {
    value: "lateShiftRem",
    label: "Late Shift Rem",
    group: "removal",
    actionType: "lateShiftRem",
    actionSymbol: "✓",
  },
  {
    value: "eosRemoval",
    label: "EOS Removal",
    group: "removal",
    actionType: "eosRemoval",
    actionSymbol: "✓",
  },
  {
    value: "removal",
    label: "Removal",
    group: "removal",
    actionType: "removal",
    actionSymbol: "✓",
  },
];

export const REMOVAL_PDF_DRAFT_ACTIONS = ACTION_DEFINITIONS.map((action) => ({ ...action }));

function normalizeActionText(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getKnownActionDefinition(row = {}) {
  const actionType = String(row?.actionType || "").trim();
  const actionLabel = normalizeActionText(row?.actionLabel || row?.actionStatus || "");

  if (actionType) {
    const typeMatch = ACTION_DEFINITIONS.find((action) => action.actionType === actionType);
    if (typeMatch) return typeMatch;
  }

  if (actionLabel.includes("early shift")) return ACTION_DEFINITIONS[1];
  if (actionLabel.includes("late shift")) return ACTION_DEFINITIONS[2];
  if (actionLabel.includes("eos removal")) return ACTION_DEFINITIONS[3];
  if (actionLabel === "removal" || actionLabel.startsWith("removal ")) return ACTION_DEFINITIONS[4];
  if (actionLabel.includes("need swapping") || row?.group !== "removal") return ACTION_DEFINITIONS[0];

  return null;
}

export function getRemovalPdfDraftActionValue(row = {}) {
  const knownAction = getKnownActionDefinition(row);
  if (knownAction) return knownAction.value;

  const customLabel = String(row?.actionLabel || row?.actionStatus || "Custom action").trim() || "Custom action";
  return `custom:${normalizeActionText(customLabel) || "action"}`;
}

export function getRemovalPdfDraftActionOptions(row = {}) {
  const actionValue = row?.swpDraftActionValue || getRemovalPdfDraftActionValue(row);
  const isKnown = ACTION_DEFINITIONS.some((action) => action.value === actionValue);
  const options = ACTION_DEFINITIONS.map(({ value, label }) => ({ value, label }));

  if (isKnown) return options;

  const currentLabel = String(row?.actionLabel || row?.actionStatus || "Current action").trim() || "Current action";
  return [{ value: actionValue, label: currentLabel }, ...options];
}

function getActionPriority(row = {}) {
  const actionValue = row?.swpDraftActionValue || getRemovalPdfDraftActionValue(row);
  const knownIndex = ACTION_DEFINITIONS.findIndex((action) => action.value === actionValue);
  if (knownIndex >= 0) return (knownIndex + 1) * 10;
  return row?.group === "removal" ? 80 : 15;
}

function normalizeDraftTrainId(value = "") {
  const digits = String(value || "").replace(/[^0-9]/g, "").slice(0, 2);
  return digits ? `T${digits.padStart(2, "0")}` : "";
}

function normalizeDraftTrainNumber(value = "") {
  const digits = String(value || "").replace(/[^0-9]/g, "").slice(0, 2);
  return digits ? digits.padStart(2, "0") : "";
}

function nextDraftIdentity(draft = {}, scope = "row") {
  const sequence = Math.max(0, Number(draft?.swpDraftSequence || 0)) + 1;
  return {
    id: `swp-new-${scope}-${sequence}`,
    sequence,
  };
}

function createDraftRemarkPills(value = "", existingPills = []) {
  const text = String(value || "").trim();
  if (!text) return [];

  const firstPill = Array.isArray(existingPills) ? existingPills[0] : null;
  return [{ ...(firstPill || {}), text }];
}

function cloneRemovalLog(log = {}, fallbackDepot = "west") {
  const depot = log?.depot || fallbackDepot;
  return {
    ...log,
    depot,
    entries: (Array.isArray(log?.entries) ? log.entries : []).map((entry, index) => ({
      ...entry,
      remarkPills: Array.isArray(entry?.remarkPills)
        ? entry.remarkPills.map((pill) => ({ ...pill }))
        : [],
      swpDraftId: `swp-${depot}-log-${index}-${normalizeDraftTrainId(entry?.trainId) || "train"}`,
    })),
  };
}

function sortDraftRows(rows = []) {
  return [...rows].sort((left, right) => {
    const priorityDifference = getActionPriority(left) - getActionPriority(right);
    if (priorityDifference) return priorityDifference;

    const sectionDifference = Number(left?.swpDraftSectionIndex || 0) - Number(right?.swpDraftSectionIndex || 0);
    if (sectionDifference) return sectionDifference;

    return Number(left?.swpDraftOrder || 0) - Number(right?.swpDraftOrder || 0);
  });
}

export function createRemovalPdfDraft({ westLog = {}, eastLog = {}, actionOverviewRows = [] } = {}) {
  let sectionIndex = 0;
  const actionRows = [];
  const clonedWestLog = cloneRemovalLog(westLog, "west");
  const clonedEastLog = cloneRemovalLog(eastLog, "east");

  (Array.isArray(actionOverviewRows) ? actionOverviewRows : []).forEach((row, sourceIndex) => {
    if (!row) return;
    if (row.isSeparator) {
      sectionIndex += 1;
      return;
    }

    const actionValue = getRemovalPdfDraftActionValue(row);
    const trainKey = String(row?.trainsetNumber || row?.key || row?.label || "train").replace(/[^a-z0-9]+/gi, "-");
    actionRows.push({
      ...row,
      swpDraftId: `swp-${sourceIndex}-${trainKey || "train"}`,
      swpDraftOrder: sourceIndex,
      swpDraftSectionIndex: sectionIndex,
      swpDraftActionValue: actionValue,
    });
  });

  return {
    westLog: clonedWestLog,
    eastLog: clonedEastLog,
    actionRows: sortDraftRows(actionRows),
    swpDraftSequence: 0,
  };
}

export function addRemovalPdfDraftLogEntry(draft = {}, depot = "west") {
  const logKey = depot === "east" ? "eastLog" : "westLog";
  const normalizedDepot = depot === "east" ? "east" : "west";
  const currentLog = draft?.[logKey] || { depot: normalizedDepot, entries: [] };
  const currentEntries = Array.isArray(currentLog?.entries) ? currentLog.entries : [];
  const identity = nextDraftIdentity(draft, `${normalizedDepot}-log`);
  const entry = {
    trainId: "",
    tid: "",
    time: "",
    remark: "",
    remarkPills: [],
    swpDraftId: identity.id,
  };

  return {
    ...draft,
    swpDraftSequence: identity.sequence,
    [logKey]: {
      ...currentLog,
      depot: currentLog?.depot || normalizedDepot,
      entries: [...currentEntries, entry],
    },
  };
}

export function addRemovalPdfDraftRow(draft = {}, actionValue = "needSwapping") {
  const action = ACTION_DEFINITIONS.find((item) => item.value === actionValue) || ACTION_DEFINITIONS[0];
  const rows = Array.isArray(draft?.actionRows) ? draft.actionRows : [];
  const matchingSections = rows
    .filter((row) => row?.swpDraftActionValue === action.value)
    .map((row) => Number(row?.swpDraftSectionIndex || 0));
  const highestSection = rows.reduce(
    (highest, row) => Math.max(highest, Number(row?.swpDraftSectionIndex || 0)),
    0,
  );
  const highestOrder = rows.reduce(
    (highest, row) => Math.max(highest, Number(row?.swpDraftOrder || 0)),
    -1,
  );
  const identity = nextDraftIdentity(draft, "requested");
  const row = {
    key: "",
    trainsetNumber: "",
    tid: "",
    requestType: "",
    group: action.group,
    actionLabel: action.label,
    actionType: action.actionType,
    actionSymbol: action.actionSymbol,
    actionStatus: `${action.label} ${action.actionSymbol}`,
    swpDraftId: identity.id,
    swpDraftOrder: highestOrder + 1,
    swpDraftSectionIndex: matchingSections.length ? Math.min(...matchingSections) : highestSection + 1,
    swpDraftActionValue: action.value,
  };

  return {
    ...draft,
    swpDraftSequence: identity.sequence,
    actionRows: sortDraftRows([...rows, row]),
  };
}

export function updateRemovalPdfDraftAction(draft = {}, rowId = "", actionValue = "") {
  const action = ACTION_DEFINITIONS.find((item) => item.value === actionValue);
  if (!action) return draft;

  const rows = Array.isArray(draft?.actionRows) ? draft.actionRows : [];
  const targetRow = rows.find((row) => row?.swpDraftId === rowId);
  if (!targetRow) return draft;

  const targetSections = rows
    .filter((row) => row?.swpDraftId !== rowId && row?.swpDraftActionValue === actionValue)
    .map((row) => Number(row?.swpDraftSectionIndex || 0));
  const fallbackSection = rows.reduce(
    (highest, row) => Math.max(highest, Number(row?.swpDraftSectionIndex || 0)),
    0,
  ) + 1;
  const targetSection = targetSections.length ? Math.min(...targetSections) : fallbackSection;

  const actionRows = rows.map((row) => {
    if (row?.swpDraftId !== rowId) return row;

    return {
      ...row,
      group: action.group,
      actionLabel: action.label,
      actionType: action.actionType,
      actionSymbol: action.actionSymbol,
      actionStatus: `${action.label} ${action.actionSymbol}`,
      swpDraftActionValue: action.value,
      swpDraftSectionIndex: targetSection,
    };
  });

  return { ...draft, actionRows: sortDraftRows(actionRows) };
}

export function updateRemovalPdfDraftRow(draft = {}, rowId = "", field = "", value = "") {
  if (!["trainsetNumber", "tid", "requestType"].includes(field)) return draft;

  const stringValue = String(value ?? "");
  const rows = Array.isArray(draft?.actionRows) ? draft.actionRows : [];
  const actionRows = rows.map((row) => {
    if (row?.swpDraftId !== rowId) return row;
    if (field === "trainsetNumber") {
      const trainsetNumber = normalizeDraftTrainNumber(stringValue);
      return {
        ...row,
        trainsetNumber,
        key: trainsetNumber ? `T${trainsetNumber}` : "",
      };
    }
    return { ...row, [field]: stringValue };
  });

  return { ...draft, actionRows };
}

export function removeRemovalPdfDraftRow(draft = {}, rowId = "") {
  const rows = Array.isArray(draft?.actionRows) ? draft.actionRows : [];
  const actionRows = rows.filter((row) => row?.swpDraftId !== rowId);
  return { ...draft, actionRows };
}

export function updateRemovalPdfDraftLogEntry(draft = {}, depot = "west", rowId = "", field = "", value = "") {
  if (!["trainId", "tid", "time", "remark"].includes(field)) return draft;

  const logKey = depot === "east" ? "eastLog" : "westLog";
  const currentLog = draft?.[logKey] || {};
  const stringValue = String(value ?? "");
  const entries = (Array.isArray(currentLog?.entries) ? currentLog.entries : []).map((entry) => {
    if (entry?.swpDraftId !== rowId) return entry;
    if (field === "trainId") return { ...entry, trainId: normalizeDraftTrainId(stringValue) };
    if (field === "remark") {
      return {
        ...entry,
        remark: stringValue,
        remarkPills: createDraftRemarkPills(stringValue, entry?.remarkPills),
      };
    }
    return { ...entry, [field]: stringValue };
  });

  return { ...draft, [logKey]: { ...currentLog, entries } };
}

export function removeRemovalPdfDraftLogEntry(draft = {}, depot = "west", rowId = "") {
  const logKey = depot === "east" ? "eastLog" : "westLog";
  const currentLog = draft?.[logKey] || {};
  const entries = (Array.isArray(currentLog?.entries) ? currentLog.entries : [])
    .filter((entry) => entry?.swpDraftId !== rowId);

  return { ...draft, [logKey]: { ...currentLog, entries } };
}

export function resetRemovalPdfDraftActions(draft = {}, sourceDraft = {}) {
  const actionRows = (Array.isArray(sourceDraft?.actionRows) ? sourceDraft.actionRows : [])
    .map((row) => ({ ...row }));

  return { ...draft, actionRows };
}

export function getRemovalPdfDraftGroups(rows = []) {
  const groups = [];

  sortDraftRows(rows).forEach((row) => {
    const actionValue = row?.swpDraftActionValue || getRemovalPdfDraftActionValue(row);
    let group = groups.find((item) => item.value === actionValue);
    if (!group) {
      group = {
        value: actionValue,
        label: String(row?.actionLabel || row?.actionStatus || "Action").trim() || "Action",
        rows: [],
      };
      groups.push(group);
    }
    group.rows.push(row);
  });

  return groups;
}

function stripDraftFields(row = {}) {
  const {
    swpDraftId,
    swpDraftOrder,
    swpDraftSectionIndex,
    swpDraftActionValue,
    swpDraftLinkedLogEntryId,
    ...exportRow
  } = row;
  return exportRow;
}

export function buildRemovalPdfDraftExportLog(log = {}) {
  return {
    ...log,
    entries: (Array.isArray(log?.entries) ? log.entries : [])
      .filter((entry) => normalizeDraftTrainId(entry?.trainId))
      .map((entry) => stripDraftFields(entry)),
  };
}

export function buildRemovalPdfDraftExportRows(rows = []) {
  const sortedRows = sortDraftRows(rows)
    .filter((row) => normalizeDraftTrainNumber(row?.trainsetNumber || row?.key));
  const exportRows = [];
  let previousActionValue = null;
  let previousSectionIndex = null;

  sortedRows.forEach((row, index) => {
    const actionValue = row?.swpDraftActionValue || getRemovalPdfDraftActionValue(row);
    const sectionIndex = Number(row?.swpDraftSectionIndex || 0);
    const needsSeparator = index > 0 && (
      actionValue !== previousActionValue || sectionIndex !== previousSectionIndex
    );

    if (needsSeparator) {
      exportRows.push({
        key: `swp-separator-${index}`,
        isSeparator: true,
      });
    }

    exportRows.push(stripDraftFields(row));
    previousActionValue = actionValue;
    previousSectionIndex = sectionIndex;
  });

  return exportRows;
}

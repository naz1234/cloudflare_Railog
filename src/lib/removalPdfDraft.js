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
    const normalizedTrainId = normalizeDraftTrainId(row?.trainsetNumber || row?.key || row?.label);
    const linkedWestEntry = row?.group === "removal"
      ? clonedWestLog.entries.find((entry) => normalizeDraftTrainId(entry?.trainId) === normalizedTrainId)
      : null;
    actionRows.push({
      ...row,
      swpDraftId: `swp-${sourceIndex}-${trainKey || "train"}`,
      swpDraftOrder: sourceIndex,
      swpDraftSectionIndex: sectionIndex,
      swpDraftActionValue: actionValue,
      swpDraftLinkedLogEntryId: linkedWestEntry?.swpDraftId || "",
    });
  });

  return {
    westLog: clonedWestLog,
    eastLog: clonedEastLog,
    actionRows: sortDraftRows(actionRows),
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

  let westLog = draft?.westLog || cloneRemovalLog({}, "west");
  let linkedLogEntryId = String(targetRow?.swpDraftLinkedLogEntryId || "");
  const westEntries = Array.isArray(westLog?.entries) ? westLog.entries : [];
  const existingLinkedEntry = westEntries.find((entry) => entry?.swpDraftId === linkedLogEntryId);

  if (action.group === "removal" && targetRow?.group !== "removal") {
    if (!existingLinkedEntry) {
      linkedLogEntryId = `swp-west-added-${rowId}`;
      const remark = String(targetRow?.requestType || "").trim();
      westLog = {
        ...westLog,
        entries: [
          ...westEntries,
          {
            swpDraftId: linkedLogEntryId,
            trainId: normalizeDraftTrainId(targetRow?.trainsetNumber || targetRow?.key),
            tid: String(targetRow?.tid || ""),
            time: "",
            remark,
            remarkPills: createDraftRemarkPills(remark),
          },
        ],
      };
    }
  } else if (action.group !== "removal" && targetRow?.group === "removal" && linkedLogEntryId) {
    westLog = {
      ...westLog,
      entries: westEntries.filter((entry) => entry?.swpDraftId !== linkedLogEntryId),
    };
    linkedLogEntryId = "";
  }

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
      swpDraftLinkedLogEntryId: linkedLogEntryId,
    };
  });

  return { ...draft, westLog, actionRows: sortDraftRows(actionRows) };
}

export function updateRemovalPdfDraftRow(draft = {}, rowId = "", field = "", value = "") {
  if (!["tid", "requestType"].includes(field)) return draft;

  const stringValue = String(value ?? "");
  const rows = Array.isArray(draft?.actionRows) ? draft.actionRows : [];
  const targetRow = rows.find((row) => row?.swpDraftId === rowId);
  const actionRows = rows.map((row) => (
    row?.swpDraftId === rowId ? { ...row, [field]: stringValue } : row
  ));

  const linkedLogEntryId = String(targetRow?.swpDraftLinkedLogEntryId || "");
  if (!linkedLogEntryId) return { ...draft, actionRows };

  const westLog = {
    ...(draft?.westLog || {}),
    entries: (Array.isArray(draft?.westLog?.entries) ? draft.westLog.entries : []).map((entry) => {
      if (entry?.swpDraftId !== linkedLogEntryId) return entry;
      if (field === "tid") return { ...entry, tid: stringValue };
      return {
        ...entry,
        remark: stringValue,
        remarkPills: createDraftRemarkPills(stringValue, entry?.remarkPills),
      };
    }),
  };

  return { ...draft, westLog, actionRows };
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
  const actionRows = (Array.isArray(draft?.actionRows) ? draft.actionRows : []).map((row) => (
    row?.swpDraftLinkedLogEntryId === rowId ? { ...row, swpDraftLinkedLogEntryId: "" } : row
  ));

  return { ...draft, [logKey]: { ...currentLog, entries }, actionRows };
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
    entries: (Array.isArray(log?.entries) ? log.entries : []).map((entry) => stripDraftFields(entry)),
  };
}

export function buildRemovalPdfDraftExportRows(rows = []) {
  const sortedRows = sortDraftRows(rows);
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

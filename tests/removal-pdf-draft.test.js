import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildRemovalPdfDraftExportLog,
  buildRemovalPdfDraftExportRows,
  createRemovalPdfDraft,
  getRemovalPdfDraftGroups,
  removeRemovalPdfDraftLogEntry,
  removeRemovalPdfDraftRow,
  updateRemovalPdfDraftAction,
  updateRemovalPdfDraftLogEntry,
  updateRemovalPdfDraftRow,
} from "../src/lib/removalPdfDraft.js";

const depotStablingSource = readFileSync(
  new URL("../src/pages/DepotStabling.jsx", import.meta.url),
  "utf8",
);
const editorSource = readFileSync(
  new URL("../src/components/depot/RemovalPdfEditor.jsx", import.meta.url),
  "utf8",
);
const themeStyles = readFileSync(
  new URL("../src/index.css", import.meta.url),
  "utf8",
);

function createSourceData() {
  return {
    westLog: {
      depot: "west",
      entries: [{ trainId: "T18", tid: "212", time: "09:03", remark: "Wash 3-Aug" }],
    },
    eastLog: {
      depot: "east",
      entries: [{ trainId: "T08", tid: "112", time: "09:05", remark: "-" }],
    },
    actionOverviewRows: [
      {
        key: "T02",
        trainsetNumber: "02",
        tid: "219",
        requestType: "G to C 3-Aug",
        group: "swap",
        actionLabel: "Need Swapping",
        actionSymbol: "⇆",
      },
      { key: "swap-wash-separator", isSeparator: true },
      {
        key: "T21",
        trainsetNumber: "21",
        tid: "211",
        requestType: "Wash 3-Aug",
        group: "swap",
        actionLabel: "Need Swapping",
        actionSymbol: "⇆",
      },
      { key: "early-separator", isSeparator: true },
      {
        key: "T09",
        trainsetNumber: "09",
        tid: "104",
        requestType: "RST PM 03-AUG",
        group: "removal",
        actionLabel: "Early Shift Rem",
        actionSymbol: "✓",
        actionType: "earlyShiftRem",
      },
      { key: "late-separator", isSeparator: true },
      {
        key: "T26",
        trainsetNumber: "26",
        tid: "215",
        requestType: "Wash 3-Aug",
        group: "removal",
        actionLabel: "Late Shift Rem",
        actionSymbol: "✓",
        actionType: "lateShiftRem",
      },
    ],
  };
}

test("the SWP draft deeply snapshots the report inputs without changing the source", () => {
  const source = createSourceData();
  const sourceBefore = structuredClone(source);
  const draft = createRemovalPdfDraft(source);

  assert.equal(draft.actionRows.length, 4);
  assert.notEqual(draft.westLog, source.westLog);
  assert.notEqual(draft.westLog.entries, source.westLog.entries);
  assert.notEqual(draft.actionRows[0], source.actionOverviewRows[0]);

  const edited = updateRemovalPdfDraftRow(draft, draft.actionRows[0].swpDraftId, "requestType", "Edited request");
  assert.equal(edited.actionRows[0].requestType, "Edited request");
  assert.deepEqual(source, sourceBefore);
});

test("changing allocation transfers the row to the selected group", () => {
  const draft = createRemovalPdfDraft(createSourceData());
  const lateRow = draft.actionRows.find((row) => row.trainsetNumber === "26");
  const edited = updateRemovalPdfDraftAction(draft, lateRow.swpDraftId, "needSwapping");
  const transferredRow = edited.actionRows.find((row) => row.swpDraftId === lateRow.swpDraftId);

  assert.equal(transferredRow.group, "swap");
  assert.equal(transferredRow.actionLabel, "Need Swapping");
  assert.equal(transferredRow.actionSymbol, "⇆");
  assert.equal(transferredRow.actionType, "");
  assert.equal(getRemovalPdfDraftGroups(edited.actionRows)[0].label, "Need Swapping");
});

test("allocation transfers reconcile the linked West removal row in the edited copy", () => {
  const draft = createRemovalPdfDraft(createSourceData());
  const swapRow = draft.actionRows.find((row) => row.trainsetNumber === "02");
  const movedToRemoval = updateRemovalPdfDraftAction(draft, swapRow.swpDraftId, "earlyShiftRem");
  const addedLogRow = movedToRemoval.westLog.entries.find((entry) => entry.trainId === "T02");

  assert.ok(addedLogRow);
  assert.equal(addedLogRow.tid, "219");
  assert.equal(addedLogRow.remark, "G to C 3-Aug");

  const movedRow = movedToRemoval.actionRows.find((row) => row.swpDraftId === swapRow.swpDraftId);
  const movedBackToSwap = updateRemovalPdfDraftAction(movedToRemoval, movedRow.swpDraftId, "needSwapping");
  assert.equal(movedBackToSwap.westLog.entries.some((entry) => entry.trainId === "T02"), false);
});

test("removing a requested allocation keeps its linked Removal Table row", () => {
  const source = createSourceData();
  source.westLog.entries.push({
    trainId: "T09",
    tid: "104",
    time: "09:39",
    remark: "RST PM 03-AUG",
  });
  const draft = createRemovalPdfDraft(source);
  const removedRow = draft.actionRows.find((row) => row.trainsetNumber === "09");
  const westEntriesBefore = structuredClone(draft.westLog.entries);
  const edited = removeRemovalPdfDraftRow(draft, removedRow.swpDraftId);
  const exportedRows = buildRemovalPdfDraftExportRows(edited.actionRows);

  assert.equal(edited.actionRows.length, 3);
  assert.equal(exportedRows.some((row) => row.trainsetNumber === "09"), false);
  assert.deepEqual(edited.westLog.entries, westEntriesBefore);
  assert.equal(edited.westLog.entries.some((entry) => entry.trainId === "T09"), true);
  assert.equal(source.actionOverviewRows.some((row) => row.trainsetNumber === "09"), true);
});

test("the edited PDF export preserves allocation separators and strips editor metadata", () => {
  const draft = createRemovalPdfDraft(createSourceData());
  const exportedRows = buildRemovalPdfDraftExportRows(draft.actionRows);
  const separatorCount = exportedRows.filter((row) => row.isSeparator).length;
  const exportedTrainRows = exportedRows.filter((row) => !row.isSeparator);

  assert.equal(separatorCount, 3);
  assert.deepEqual(exportedTrainRows.map((row) => row.trainsetNumber), ["02", "21", "09", "26"]);
  assert.equal("swpDraftId" in exportedTrainRows[0], false);
  assert.equal("swpDraftActionValue" in exportedTrainRows[0], false);
});

test("depot PDF rows can be edited or removed without mutating the source log", () => {
  const source = createSourceData();
  const draft = createRemovalPdfDraft(source);
  const westRow = draft.westLog.entries[0];
  const renamed = updateRemovalPdfDraftLogEntry(draft, "west", westRow.swpDraftId, "trainId", "7");
  const remarked = updateRemovalPdfDraftLogEntry(renamed, "west", westRow.swpDraftId, "remark", "Edited wash");
  const exported = buildRemovalPdfDraftExportLog(remarked.westLog);

  assert.equal(exported.entries[0].trainId, "T07");
  assert.equal(exported.entries[0].remark, "Edited wash");
  assert.equal(exported.entries[0].remarkPills[0].text, "Edited wash");
  assert.equal("swpDraftId" in exported.entries[0], false);
  assert.equal(source.westLog.entries[0].trainId, "T18");

  const removed = removeRemovalPdfDraftLogEntry(remarked, "west", westRow.swpDraftId);
  assert.equal(removed.westLog.entries.length, 0);
  assert.equal(source.westLog.entries.length, 1);
});

test("the Removal Summary toolbar opens SWP instead of downloading PNG", () => {
  assert.match(depotStablingSource, /aria-label="Open SWP PDF Editor"/);
  assert.match(depotStablingSource, /<Pencil size=\{12\} \/>\s*SWP/);
  assert.match(depotStablingSource, /downloadEditedCombinedRemovalPdf/);
  assert.match(depotStablingSource, /west-east-depot-removal-edited-\$\{dateStamp\}\.pdf/);
  assert.doesNotMatch(depotStablingSource, /handleTrainRemPngDownload|downloadCombinedRemovalPng|theme-train-rem-png/);
});

test("the SWP editor states that live and normal PDF data remain unchanged", () => {
  assert.match(editorSource, /Changes here never update the Removal Summary, live records, or the normal PDF button\./);
  assert.match(editorSource, /Download edited PDF/);
  assert.match(editorSource, /Reset from summary/);
  assert.match(editorSource, /Remove from edited PDF/);
  assert.match(editorSource, /Removal tables/);
  assert.match(editorSource, /backgroundRoot\.inert = true/);
  assert.match(editorSource, /previousActiveElement\?\.focus/);
  assert.match(editorSource, /row\?\.trainsetNumber \|\| row\?\.trainId/);
  assert.match(editorSource, /Deleting an allocation keeps its Removal Table entry\./);
});

test("the SWP button and editor have explicit light-mode contrast", () => {
  assert.match(themeStyles, /html\[data-app-theme="light"\] \.theme-train-rem-toolbar \.theme-train-rem-swp/);
  assert.match(themeStyles, /html\[data-app-theme="light"\] \.theme-swp-editor-window/);
  assert.match(themeStyles, /html\[data-app-theme="light"\] \.theme-swp-editor-input/);
  assert.match(themeStyles, /html\[data-app-theme="light"\] \.theme-swp-editor-download/);
});

test("the SWP editor has explicit readable dark-mode contrast", () => {
  assert.match(themeStyles, /\.theme-swp-editor-window\s*\{[^}]*color: #f8fafc;[^}]*background: #071a2a;/s);
  assert.match(themeStyles, /\.theme-swp-editor-input::placeholder\s*\{[^}]*color: #b8cbd9;/s);
  assert.match(themeStyles, /\.theme-swp-editor-table th\s*\{[^}]*color: #c5ebfb;/s);
});

test("the SWP editor tables fit their panels without horizontal minimum widths", () => {
  assert.doesNotMatch(editorSource, /min-w-\[(?:570|760)px\]/);
  assert.doesNotMatch(editorSource, /overflow-x-auto/);
  assert.match(editorSource, /theme-swp-editor-table w-full min-w-0 table-fixed/);
  assert.match(editorSource, /max-w-\[1040px\]/);
  assert.match(editorSource, /w-\[50px\].*Train/);
  assert.match(editorSource, /w-\[155px\].*Allocation/);
});

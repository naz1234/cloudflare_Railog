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
  resetRemovalPdfDraftActions,
  updateRemovalPdfDraftAction,
  updateRemovalPdfDraftLogEntry,
  updateRemovalPdfDraftRow,
} from "../src/lib/removalPdfDraft.js";
import {
  createEastNineAmRemovalPdfDraft,
  selectEastNineAmOffPeakRows,
} from "../src/lib/eastNineAmRemoval.js";

const depotStablingSource = readFileSync(
  new URL("../src/pages/DepotStabling.jsx", import.meta.url),
  "utf8",
);
const editorSource = readFileSync(
  new URL("../src/components/depot/RemovalPdfEditor.jsx", import.meta.url),
  "utf8",
);
const eastNineAmEditorSource = readFileSync(
  new URL("../src/components/depot/EastNineAmRemovalPdfEditor.jsx", import.meta.url),
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

test("Requested Train Allocation changes never affect either Removal Table", () => {
  const draft = createRemovalPdfDraft(createSourceData());
  const logsBefore = structuredClone({ westLog: draft.westLog, eastLog: draft.eastLog });
  const swapRow = draft.actionRows.find((row) => row.trainsetNumber === "02");
  const movedToRemoval = updateRemovalPdfDraftAction(draft, swapRow.swpDraftId, "earlyShiftRem");
  const movedRow = movedToRemoval.actionRows.find((row) => row.swpDraftId === swapRow.swpDraftId);
  const editedTid = updateRemovalPdfDraftRow(movedToRemoval, movedRow.swpDraftId, "tid", "999");
  const editedRemark = updateRemovalPdfDraftRow(editedTid, movedRow.swpDraftId, "requestType", "Allocation only");
  const removed = removeRemovalPdfDraftRow(editedRemark, movedRow.swpDraftId);
  const removalRow = draft.actionRows.find((row) => row.trainsetNumber === "26");
  const movedToSwapping = updateRemovalPdfDraftAction(draft, removalRow.swpDraftId, "needSwapping");

  assert.equal(movedRow.group, "removal");
  assert.deepEqual({ westLog: removed.westLog, eastLog: removed.eastLog }, logsBefore);
  assert.deepEqual(
    { westLog: movedToSwapping.westLog, eastLog: movedToSwapping.eastLog },
    logsBefore,
  );
});

test("removing a requested allocation keeps its existing Removal Table row", () => {
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

test("Removal Table changes never affect Requested Train Allocation", () => {
  const source = createSourceData();
  const draft = createRemovalPdfDraft(source);
  const actionRowsBefore = structuredClone(draft.actionRows);
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
  assert.deepEqual(removed.actionRows, actionRowsBefore);
  assert.equal(source.westLog.entries.length, 1);
});

test("resetting allocations preserves edits made in Removal Tables", () => {
  const draft = createRemovalPdfDraft(createSourceData());
  const westRow = draft.westLog.entries[0];
  const editedRemoval = updateRemovalPdfDraftLogEntry(
    draft,
    "west",
    westRow.swpDraftId,
    "remark",
    "Keep this removal edit",
  );
  const changedAllocation = updateRemovalPdfDraftAction(
    editedRemoval,
    draft.actionRows[0].swpDraftId,
    "earlyShiftRem",
  );
  const reset = resetRemovalPdfDraftActions(changedAllocation, draft);

  assert.equal(reset.westLog.entries[0].remark, "Keep this removal edit");
  assert.deepEqual(reset.actionRows, draft.actionRows);
});

test("East 9AM off-peak selection removes both depot schedules and preserves TID pairing", () => {
  const referenceTids = [
    101, 102, 103, 104, 105, 106, 107, 108, 109, 110,
    111, 112, 113, 114, 115, 116, 117, 118, 119, 120,
    201, 202, 203, 204, 205, 206, 207, 208, 209, 210,
    211, 212, 213, 214, 215, 216, 217, 218, 219, 220,
  ];
  const referenceRows = referenceTids.map((tid, index) => ({ trainId: `T${String(index + 1).padStart(2, "0")}`, tid }));
  const westRemovalTids = [212, 214, 216, 218, 220, 102, 104, 106, 108, 110];
  const eastRemovalTids = [112, 114, 116, 118, 120, 202, 204, 206, 208, 210];
  const offPeakRows = selectEastNineAmOffPeakRows(referenceRows, westRemovalTids, eastRemovalTids);

  assert.deepEqual(
    offPeakRows.map((row) => row.tid),
    ["101", "103", "105", "107", "109", "111", "113", "115", "117", "119", "201", "203", "205", "207", "209", "211", "213", "215", "217", "219"],
  );
  assert.equal(offPeakRows[0].trainId, "T01");
  assert.equal(offPeakRows.at(-1).trainId, "T39");
});

test("the ED 9AM draft clones East removal and off-peak rows without requested allocation", () => {
  const eastLog = {
    depot: "east",
    entries: [{ trainId: "T08", tid: "112", time: "09:05", remark: "Wash 4-Aug" }],
  };
  const offPeakRows = [
    { trainId: "T03", tid: "101", remark: "-" },
    { trainId: "T29", tid: "207", remark: "RST PM 04-AUG" },
  ];
  const eastBefore = structuredClone(eastLog);
  const offPeakBefore = structuredClone(offPeakRows);
  const draft = createEastNineAmRemovalPdfDraft({ eastLog, offPeakRows });

  assert.equal(draft.draftType, "eastNineAmOffPeak");
  assert.deepEqual(draft.actionRows, []);
  assert.deepEqual(draft.eastLog.entries.map((row) => row.tid), ["112"]);
  assert.deepEqual(draft.westLog.entries.map((row) => row.tid), ["101", "207"]);
  assert.notEqual(draft.eastLog.entries[0], eastLog.entries[0]);
  assert.deepEqual(eastLog, eastBefore);
  assert.deepEqual(offPeakRows, offPeakBefore);
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
  assert.match(editorSource, /Reset allocations/);
  assert.match(editorSource, /Remove from edited PDF/);
  assert.match(editorSource, /Removal tables/);
  assert.match(editorSource, /backgroundRoot\.inert = true/);
  assert.match(editorSource, /previousActiveElement\?\.focus/);
  assert.match(editorSource, /row\?\.trainsetNumber \|\| row\?\.trainId/);
  assert.match(editorSource, /Changing, editing, or removing an allocation does not change either Removal Table\./);
  assert.match(editorSource, /Editing or removing a row here does not change Requested Train Allocation\./);
  assert.doesNotMatch(editorSource, /reconciles its linked West removal row/);
  assert.match(editorSource, /ED 9AM REM/);
});

test("ED 9AM REM opens a separate editor and omits requested train allocation", () => {
  assert.match(depotStablingSource, /createTrainRemEastNineAmDraft/);
  assert.match(depotStablingSource, /collectTrainRemMainlineInServiceRows\(nineAmState, activeTimetable\)/);
  assert.match(depotStablingSource, /layout: "eastNineAmOffPeak"/);
  assert.match(depotStablingSource, /east-depot-9am-removal-\$\{dateStamp\}\.pdf/);
  assert.match(eastNineAmEditorSource, /Removal tables/);
  assert.match(eastNineAmEditorSource, /Off peak tables/);
  assert.match(eastNineAmEditorSource, /Download ED 9AM REM PDF/);
  assert.doesNotMatch(eastNineAmEditorSource, /Requested train allocation/);
});

test("the SWP button and editor have explicit light-mode contrast", () => {
  assert.match(themeStyles, /html\[data-app-theme="light"\] \.theme-train-rem-toolbar \.theme-train-rem-swp/);
  assert.match(themeStyles, /html\[data-app-theme="light"\] \.theme-swp-editor-window/);
  assert.match(themeStyles, /html\[data-app-theme="light"\] \.theme-swp-editor-input/);
  assert.match(themeStyles, /html\[data-app-theme="light"\] \.theme-swp-editor-download/);
  assert.match(themeStyles, /html\[data-app-theme="light"\] \.theme-swp-ed9-open/);
  assert.match(themeStyles, /html\[data-app-theme="light"\] \.theme-swp-ed9-back/);
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

test("identical custom remarks use one PDF pill color in removal and requested tables", () => {
  assert.match(depotStablingSource, /function getRemovalPdfRemarkPillStyle\(remark = "", options = \{\}\)/);
  assert.match(
    depotStablingSource,
    /const pillStyle = getRemovalPdfRemarkPillStyle\(text, \{ colorCustom: true \}\);/,
  );
  assert.match(
    depotStablingSource,
    /const pillStyle = getRemovalPdfRemarkPillStyle\(remark, \{ colorCustom: true \}\);/,
  );
  assert.doesNotMatch(
    depotStablingSource,
    /stroke: item\?\.badgeBorder \|\| item\?\.badgeBg \|\| "#000000"/,
  );
});

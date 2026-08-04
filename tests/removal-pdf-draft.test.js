import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  addRemovalPdfDraftLogEntry,
  addRemovalPdfDraftRow,
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

test("Add creates independent blank Removal Table rows with unique draft IDs", () => {
  const draft = createRemovalPdfDraft(createSourceData());
  const draftBefore = structuredClone(draft);
  const withWestRow = addRemovalPdfDraftLogEntry(draft, "west");
  const westRow = withWestRow.westLog.entries.at(-1);
  const withEastRow = addRemovalPdfDraftLogEntry(withWestRow, "east");
  const eastRow = withEastRow.eastLog.entries.at(-1);

  assert.deepEqual(
    {
      trainId: westRow.trainId,
      tid: westRow.tid,
      time: westRow.time,
      remark: westRow.remark,
      remarkPills: westRow.remarkPills,
    },
    { trainId: "", tid: "", time: "", remark: "", remarkPills: [] },
  );
  assert.equal(withWestRow.westLog.entries.length, draft.westLog.entries.length + 1);
  assert.deepEqual(withWestRow.eastLog, draft.eastLog);
  assert.deepEqual(withWestRow.actionRows, draft.actionRows);
  assert.equal(withEastRow.eastLog.entries.length, draft.eastLog.entries.length + 1);
  assert.deepEqual(withEastRow.westLog, withWestRow.westLog);
  assert.deepEqual(withEastRow.actionRows, draft.actionRows);
  assert.notEqual(westRow.swpDraftId, eastRow.swpDraftId);
  assert.deepEqual(draft, draftBefore);
});

test("Add creates an editable requested row without changing either Removal Table", () => {
  const draft = createRemovalPdfDraft(createSourceData());
  const logsBefore = structuredClone({ westLog: draft.westLog, eastLog: draft.eastLog });
  const withRequestedRow = addRemovalPdfDraftRow(draft);
  const addedRow = withRequestedRow.actionRows.find((row) => row.swpDraftId.startsWith("swp-new-requested-"));

  assert.ok(addedRow);
  assert.equal(addedRow.trainsetNumber, "");
  assert.equal(addedRow.tid, "");
  assert.equal(addedRow.requestType, "");
  assert.equal(addedRow.swpDraftActionValue, "needSwapping");
  assert.equal(addedRow.actionLabel, "Need Swapping");
  assert.deepEqual(
    { westLog: withRequestedRow.westLog, eastLog: withRequestedRow.eastLog },
    logsBefore,
  );

  const edited = updateRemovalPdfDraftRow(
    withRequestedRow,
    addedRow.swpDraftId,
    "trainsetNumber",
    "T7",
  );
  const editedRow = edited.actionRows.find((row) => row.swpDraftId === addedRow.swpDraftId);
  const exportedRow = buildRemovalPdfDraftExportRows(edited.actionRows)
    .find((row) => !row.isSeparator && row.trainsetNumber === "07");

  assert.equal(editedRow.trainsetNumber, "07");
  assert.equal(editedRow.key, "T07");
  assert.ok(exportedRow);
  assert.equal("swpDraftId" in exportedRow, false);
  assert.deepEqual(draft.actionRows.length + 1, withRequestedRow.actionRows.length);
});

test("all Add operations use unique IDs across removal and requested rows", () => {
  let draft = createRemovalPdfDraft(createSourceData());
  draft = addRemovalPdfDraftLogEntry(draft, "west");
  const westId = draft.westLog.entries.at(-1).swpDraftId;
  draft = addRemovalPdfDraftLogEntry(draft, "east");
  const eastId = draft.eastLog.entries.at(-1).swpDraftId;
  draft = addRemovalPdfDraftRow(draft);
  const requestedId = draft.actionRows.find((row) => row.swpDraftId.startsWith("swp-new-requested-"))?.swpDraftId;

  assert.ok(requestedId);
  assert.equal(new Set([westId, eastId, requestedId]).size, 3);
});

test("blank rows added in the editor are omitted from PDF exports", () => {
  const draft = createRemovalPdfDraft(createSourceData());
  const withBlankLogRow = addRemovalPdfDraftLogEntry(draft, "west");
  const withBlankRequestedRow = addRemovalPdfDraftRow(withBlankLogRow);
  const exportedLog = buildRemovalPdfDraftExportLog(withBlankRequestedRow.westLog);
  const exportedRequestedRows = buildRemovalPdfDraftExportRows(withBlankRequestedRow.actionRows)
    .filter((row) => !row.isSeparator);

  assert.deepEqual(exportedLog.entries.map((row) => row.trainId), ["T18"]);
  assert.deepEqual(
    exportedRequestedRows.map((row) => row.trainsetNumber),
    ["02", "21", "09", "26"],
  );
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

test("ED 9AM Add keeps East removal and off-peak tables independent", () => {
  const draft = createEastNineAmRemovalPdfDraft({
    eastLog: {
      depot: "east",
      entries: [{ trainId: "T08", tid: "112", time: "09:05", remark: "Wash 4-Aug" }],
    },
    offPeakRows: [{ trainId: "T03", tid: "101", time: "", remark: "-" }],
  });
  const draftBefore = structuredClone(draft);
  const withEastRow = addRemovalPdfDraftLogEntry(draft, "east");
  const eastAddedId = withEastRow.eastLog.entries.at(-1).swpDraftId;

  assert.equal(withEastRow.eastLog.entries.length, 2);
  assert.deepEqual(withEastRow.westLog, draft.westLog);
  assert.deepEqual(withEastRow.actionRows, []);
  assert.equal(withEastRow.draftType, "eastNineAmOffPeak");

  const withOffPeakRow = addRemovalPdfDraftLogEntry(withEastRow, "west");
  const offPeakAddedId = withOffPeakRow.westLog.entries.at(-1).swpDraftId;

  assert.equal(withOffPeakRow.westLog.entries.length, 2);
  assert.deepEqual(withOffPeakRow.eastLog, withEastRow.eastLog);
  assert.deepEqual(withOffPeakRow.actionRows, []);
  assert.equal(withOffPeakRow.draftType, "eastNineAmOffPeak");
  assert.notEqual(eastAddedId, offPeakAddedId);
  assert.deepEqual(draft, draftBefore);
});

test("the Removal Summary toolbar opens SWP instead of downloading PNG", () => {
  assert.match(depotStablingSource, /aria-label="Open SWP PDF Editor"/);
  assert.match(depotStablingSource, /<Pencil size=\{12\} \/>\s*SWP/);
  assert.match(depotStablingSource, /downloadEditedCombinedRemovalPdf/);
  assert.match(depotStablingSource, /west-east-depot-removal-edited-\$\{dateStamp\}\.pdf/);
  assert.doesNotMatch(depotStablingSource, /handleTrainRemPngDownload|downloadCombinedRemovalPng|theme-train-rem-png/);
});

test("the SWP editor preserves draft independence and accessible modal behavior", () => {
  assert.match(editorSource, /Changes here never update the Removal Summary, live records, or the normal PDF button\./);
  assert.match(editorSource, /Removal Tables and Requested Train Allocation stay independent in this edited copy\./);
  assert.match(editorSource, /Download edited PDF/);
  assert.match(editorSource, /Remove from edited PDF/);
  assert.match(editorSource, /role="dialog"/);
  assert.match(editorSource, /aria-modal="true"/);
  assert.match(editorSource, /backgroundRoot\.inert = true/);
  assert.match(editorSource, /previousActiveElement\?\.focus/);
  assert.match(editorSource, /row\?\.trainsetNumber \|\| row\?\.trainId/);
  assert.doesNotMatch(editorSource, /reconciles its linked West removal row/);
  assert.match(editorSource, /ED 9AM REM/);
});

test("the SWP editor uses a paper preview with Add, Remove, and Allocation controls", () => {
  assert.match(editorSource, /className="theme-swp-paper"[^>]*data-pdf-page/);
  assert.match(editorSource, />DEPOT REMOVAL SUMMARY</);
  assert.match(editorSource, /aria-label=\{`Add \$\{label\} removal row`\}/);
  assert.match(editorSource, /aria-label="Add requested train allocation row"/);
  assert.match(editorSource, /data-pdf-control="add"/);
  assert.match(editorSource, /data-pdf-control="remove"/);
  assert.match(editorSource, /<select[\s\S]*?data-pdf-control="allocation"[\s\S]*?getRemovalPdfDraftActionOptions\(row\)\.map/);
  assert.match(editorSource, /onChange=\{\(event\) => handleFieldChange\(row\.swpDraftId, "trainsetNumber", event\.target\.value\)\}/);
  assert.match(editorSource, /REQUESTED TRAIN - Total: \{rowCount\}/);
});

test("ED 9AM REM opens a separate editor and omits requested train allocation", () => {
  assert.match(depotStablingSource, /createTrainRemEastNineAmDraft/);
  assert.match(depotStablingSource, /collectTrainRemMainlineInServiceRows\(nineAmState, activeTimetable\)/);
  assert.match(depotStablingSource, /layout: "eastNineAmOffPeak"/);
  assert.match(depotStablingSource, /east-depot-9am-removal-\$\{dateStamp\}\.pdf/);
  assert.match(eastNineAmEditorSource, /className="theme-swp-paper theme-swp-paper-ed9"[^>]*data-pdf-page/);
  assert.match(eastNineAmEditorSource, /EAST DEPOT 9AM REMOVAL &amp; OFF-PEAK TRAINS/);
  assert.match(eastNineAmEditorSource, /label: "East Depot Removal"/);
  assert.match(eastNineAmEditorSource, /label: "Off-Peak Trains"/);
  assert.match(eastNineAmEditorSource, /aria-label=\{`Add \$\{label\} row`\}/);
  assert.match(eastNineAmEditorSource, /data-pdf-control="add"/);
  assert.match(eastNineAmEditorSource, /data-pdf-control="remove"/);
  assert.match(eastNineAmEditorSource, /Download ED 9AM REM PDF/);
  assert.match(eastNineAmEditorSource, /backgroundRoot\.inert = true/);
  assert.match(eastNineAmEditorSource, /previousActiveElement\?\.focus/);
  assert.doesNotMatch(eastNineAmEditorSource, /Requested train allocation/i);
  assert.doesNotMatch(eastNineAmEditorSource, /data-pdf-control="allocation"/);
});

test("the SWP button and editor have explicit light-mode contrast", () => {
  assert.match(themeStyles, /html\[data-app-theme="light"\] \.theme-train-rem-toolbar \.theme-train-rem-swp/);
  assert.match(themeStyles, /html\[data-app-theme="light"\] \.theme-swp-editor-window/);
  assert.match(themeStyles, /html\[data-app-theme="light"\] \.theme-swp-editor-input/);
  assert.match(themeStyles, /html\[data-app-theme="light"\] \.theme-swp-editor-download/);
  assert.match(themeStyles, /html\[data-app-theme="light"\] \.theme-swp-ed9-open/);
  assert.match(themeStyles, /html\[data-app-theme="light"\] \.theme-swp-ed9-back/);
});

test("both PDF editors use the approved graphite amber and plum palette", () => {
  assert.match(
    themeStyles,
    /\.theme-swp-editor-window\s*\{[^}]*background: #151a20;[^}]*border-color: #59616a;/s,
  );
  assert.match(
    themeStyles,
    /\.theme-swp-editor-notice\s*\{[^}]*background: #27231c;[^}]*border-color: #d5a64a;/s,
  );
  assert.match(
    themeStyles,
    /\.theme-swp-editor-download\s*\{[^}]*background: #8f5d14;[^}]*border-color: #d69a2d;/s,
  );
  assert.match(
    themeStyles,
    /\.theme-swp-ed9-open\s*\{[^}]*background: #6e557f;[^}]*border-color: #9172a7;/s,
  );
  assert.match(
    themeStyles,
    /\.theme-swp-paper \.theme-swp-paper-select:is\(\[data-action="lateShiftRem"\], \[data-action="eosRemoval"\]\)\s*\{[^}]*background-color: #b69ac8 !important;/s,
  );
  assert.doesNotMatch(editorSource, /emerald|cyan/);
  assert.doesNotMatch(eastNineAmEditorSource, /emerald|cyan/);
  assert.doesNotMatch(editorSource, /#020b13|#9cc5df|#789db5/);
  assert.doesNotMatch(eastNineAmEditorSource, /#020b13|#9cc5df|#789db5/);
});

test("the SWP and ED editors render a fixed white PDF-style paper in both themes", () => {
  assert.match(editorSource, /theme-swp-paper-viewport/);
  assert.match(eastNineAmEditorSource, /theme-swp-paper-viewport/);
  assert.match(themeStyles, /\.theme-swp-paper\s*\{[^}]*color: #111827;[^}]*background: #ffffff;[^}]*font-family: Arial, Helvetica, sans-serif;/s);
  assert.match(themeStyles, /\.theme-swp-paper-layout\s*\{[^}]*display: grid;[^}]*grid-template-columns:/s);
  assert.match(themeStyles, /\.theme-swp-paper-ed9-layout\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/s);
  assert.match(themeStyles, /\.theme-swp-paper \.theme-swp-paper-table th,[\s\S]*?background: #ffffff !important;[\s\S]*?border: 1px solid #202020 !important;/);
  assert.match(themeStyles, /\.theme-swp-paper \.theme-swp-paper-select/);
  assert.match(themeStyles, /\.theme-swp-paper \.theme-swp-paper-remove/);
});

test("the PDF-style paper preserves its layout through a scrollable narrow viewport", () => {
  assert.match(editorSource, /theme-swp-paper-viewport min-h-0 flex-1 overflow-auto/);
  assert.match(eastNineAmEditorSource, /theme-swp-paper-viewport min-h-0 flex-1 overflow-auto/);
  assert.match(themeStyles, /\.theme-swp-paper\s*\{[^}]*min-width: 940px;[^}]*max-width: 1160px;/s);
  assert.match(themeStyles, /@media \(max-width: 760px\)[\s\S]*?\.theme-swp-paper \{ min-width: 900px;/);
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

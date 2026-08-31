import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pageSource = readFileSync(
  new URL("../src/pages/DepotStabling.jsx", import.meta.url),
  "utf8",
);
const themeStyles = readFileSync(
  new URL("../src/index.css", import.meta.url),
  "utf8",
);

const sectionStart = pageSource.indexOf("function PSTStablingSection");
const sectionEnd = pageSource.indexOf("function normalizePSTEntryType", sectionStart);
const sectionSource = pageSource.slice(sectionStart, sectionEnd);
const tabStart = pageSource.indexOf("function PSTTabContent");
const tabEnd = pageSource.indexOf("function parsePossessionTimeTo24", tabStart);
const tabSource = pageSource.slice(tabStart, tabEnd);
const historyStart = pageSource.indexOf("const getPSTEditableDepotSnapshot = useCallback");
const historyEnd = pageSource.indexOf("const commitPSTPg2WorkState = useCallback", historyStart);
const historySource = pageSource.slice(historyStart, historyEnd);
const activeStart = pageSource.indexOf("const activePSTWestData = pstPg2Stabling.westData");
const activeEnd = pageSource.indexOf("const handleAddRequest = async", activeStart);
const activeSource = pageSource.slice(activeStart, activeEnd);

test("PST uses one editable stabling view without PG1 or PG2 controls", () => {
  assert.ok(sectionStart >= 0);
  assert.match(sectionSource, /<InsertionEditableHeaderControls/);
  assert.match(sectionSource, /workLabel="PST \/ Train Prep"/);
  assert.doesNotMatch(sectionSource, /InsertionPgHeaderControls|onPgChange|activePg|Refresh PG2/);
  assert.match(sectionSource, /stablingEditable = true/);
  assert.match(tabSource, /<PSTStablingSection[^\n]+stablingEditable/);
  assert.doesNotMatch(pageSource, /function InsertionPgHeaderControls/);
});

test("PST always renders and edits its separate editable stabling state", () => {
  assert.match(activeSource, /activePSTWestData = pstPg2Stabling\.westData/);
  assert.match(activeSource, /activePSTEastData = pstPg2Stabling\.eastData/);
  assert.match(activeSource, /getPSTDepotStateEntries\(pstPg2State, "west"\)/);
  assert.match(activeSource, /getPSTDepotStateEntries\(pstPg2State, "east"\)/);
  assert.match(activeSource, /getPSTEntriesForDepot\(pstPg2LogLines, "west"\)/);
  assert.match(activeSource, /getPSTEntriesForDepot\(pstPg2LogLines, "east"\)/);
  assert.match(pageSource, /onEditablePSTTrainIdChange=\{handlePSTPg2TrainIdChange\}/);
});

test("PST exposes depot-specific Undo, Redo and dirty Refresh controls", () => {
  assert.match(sectionSource, /onRefresh=\{onRefreshStabling\}/);
  assert.match(sectionSource, /onUndo=\{onUndoStabling\}/);
  assert.match(sectionSource, /onRedo=\{onRedoStabling\}/);
  assert.match(sectionSource, /canUndo=\{canUndoStabling\}/);
  assert.match(sectionSource, /canRedo=\{canRedoStabling\}/);
  assert.match(sectionSource, /isDirty=\{isStablingDirty\}/);
  assert.match(activeSource, /westPSTStablingDirty = !insertionStablingTrainPositionsMatch/);
  assert.match(activeSource, /eastPSTStablingDirty = !insertionStablingTrainPositionsMatch/);
});

test("PST dirty Refresh uses the same pulse and flame animations as Insertion", () => {
  assert.match(
    themeStyles,
    /\.theme-pst-section \.theme-insertion-refresh-button\.is-dirty \{\s*animation: insertion-refresh-dirty-pulse/,
  );
  assert.match(
    themeStyles,
    /\.theme-pst-section \.theme-insertion-refresh-fire \{[\s\S]*?animation: insertion-refresh-fire-flicker/,
  );
  assert.match(
    themeStyles,
    /prefers-reduced-motion: reduce[\s\S]*?\.theme-pst-section \.theme-insertion-refresh-fire[\s\S]*?animation: none !important/,
  );
});

test("PST history restores depot layout and matching PST work", () => {
  assert.ok(historyStart >= 0 && historyEnd > historyStart);
  assert.match(historySource, /stabling: normalizeStablingDepotData\(depotData, targetRoads\)/);
  assert.match(historySource, /pstState: getPSTDepotStateEntries/);
  assert.match(historySource, /prepState: getPSTDepotStateEntries/);
  assert.match(historySource, /logLines: getPSTEntriesForDepot/);
  assert.match(historySource, /taNameState: getPSTDepotStateEntries/);
  assert.match(historySource, /history\.future = \[\.\.\.history\.future\.slice\(-49\), getPSTEditableDepotSnapshot/);
  assert.match(historySource, /history\.past = \[\.\.\.history\.past\.slice\(-49\), getPSTEditableDepotSnapshot/);
  assert.match(historySource, /rememberPSTEditableDepot\(normalizedDepot\);[\s\S]*markPSTLiveLocalEdit\(\)/);
});

test("PST Refresh copies only the selected Main Stabling depot and clears its work", () => {
  assert.match(historySource, /mainDepotData = normalizedDepot === "west" \? westDataRef\.current : eastDataRef\.current/);
  assert.match(historySource, /stabling: normalizeStablingDepotData\(mainDepotData, targetRoads\)/);
  assert.match(historySource, /pstState: \{\}/);
  assert.match(historySource, /prepState: \{\}/);
  assert.match(historySource, /logLines: \[\]/);
  assert.match(historySource, /taNameState: \{\}/);
  assert.doesNotMatch(historySource, /setWestData|setEastData|updateBlockTrain|commitBlockTrain/);
});

test("editable PST stabling and work remain in local and live-sync payloads", () => {
  assert.match(historySource, /savePSTPg2Stabling\(nextStabling\)/);
  assert.match(historySource, /savePSTPg2WorkState\(/);
  assert.match(pageSource, /pg2Stabling: pstPg2Stabling/);
  assert.match(pageSource, /pg2WorkState: \{[\s\S]*pstState: pstPg2State/);
  assert.match(pageSource, /setTimeout\(\(\) => \{[\s\S]*savePSTLiveToDbRef\.current\?\.\(\);[\s\S]*\}, 1200\)/);
});

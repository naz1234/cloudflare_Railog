import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pageSource = readFileSync(
  new URL("../src/pages/DepotStabling.jsx", import.meta.url),
  "utf8",
);
const stylesheetSource = readFileSync(
  new URL("../src/index.css", import.meta.url),
  "utf8",
);

const controlsStart = pageSource.indexOf("function InsertionEditableHeaderControls");
const controlsEnd = pageSource.indexOf("function InsertionCell", controlsStart);
const controlsSource = pageSource.slice(controlsStart, controlsEnd);
const sectionStart = pageSource.indexOf("function InsertionStablingSection");
const sectionEnd = pageSource.indexOf("function getInsertionEntrySortMinutes", sectionStart);
const sectionSource = pageSource.slice(sectionStart, sectionEnd);
const configStart = pageSource.indexOf("const buildInsertionSectionConfig = (depot)");
const configEnd = pageSource.indexOf("const insertionAssignmentsByDepot", configStart);
const configSource = pageSource.slice(configStart, configEnd);

test("Request stabling is one editable view without PG1 or PG2 controls", () => {
  assert.ok(controlsStart >= 0);
  assert.match(controlsSource, />\s*Editable Stabling\s*</);
  assert.match(sectionSource, /<InsertionEditableHeaderControls/);
  assert.doesNotMatch(sectionSource, /<InsertionPgHeaderControls/);
  assert.doesNotMatch(controlsSource, /PG1|PG2|onPgChange/);
  assert.match(configSource, /data: isWest \? pg2Stabling\.westData : pg2Stabling\.eastData/);
  assert.match(configSource, /stablingEditable: true/);
});

test("editable stabling exposes depot-specific Undo, Redo and Refresh controls", () => {
  assert.match(controlsSource, /onClick=\{onUndo\}[\s\S]*>\s*<Undo2[\s\S]*Undo/);
  assert.match(controlsSource, /onClick=\{onRedo\}[\s\S]*>\s*<Redo2[\s\S]*Redo/);
  assert.match(controlsSource, /onClick=\{onRefresh\}[\s\S]*Refresh/);
  assert.match(configSource, /handleUndoInsertionStabling\(normalizedDepot\)/);
  assert.match(configSource, /handleRedoInsertionStabling\(normalizedDepot\)/);
});

test("Refresh shows an animated fire warning when editable positions differ from Main Stabling", () => {
  assert.match(pageSource, /function insertionStablingTrainPositionsMatch\([\s\S]*normalizeTrainId/);
  assert.match(controlsSource, /isDirty \? "is-dirty" : "is-synced"/);
  assert.match(controlsSource, /<Flame className="theme-insertion-refresh-fire/);
  assert.match(pageSource, /westInsertionStablingDirty = !insertionStablingTrainPositionsMatch/);
  assert.match(pageSource, /eastInsertionStablingDirty = !insertionStablingTrainPositionsMatch/);
  assert.match(stylesheetSource, /@keyframes insertion-refresh-fire-flicker/);
  assert.match(stylesheetSource, /\.theme-insertion-refresh-button\.is-dirty[\s\S]*animation: insertion-refresh-dirty-pulse/);
  assert.match(stylesheetSource, /@media \(prefers-reduced-motion: reduce\)[\s\S]*theme-insertion-refresh-fire/);
});

test("stabling history preserves depot layout and insertion work across undo and redo", () => {
  assert.match(pageSource, /const getInsertionEditableDepotSnapshot = useCallback/);
  assert.match(pageSource, /stabling: normalizeStablingDepotData\(depotData, targetRoads\)/);
  assert.match(pageSource, /insertionLog: snapshotLog/);
  assert.match(pageSource, /tidInputs: snapshotInputs/);
  assert.match(pageSource, /history\.future = \[\.\.\.history\.future\.slice\(-49\), getInsertionEditableDepotSnapshot/);
  assert.match(pageSource, /history\.past = \[\.\.\.history\.past\.slice\(-49\), getInsertionEditableDepotSnapshot/);
  assert.match(pageSource, /rememberInsertionEditableDepot\(normalizedDepot\);[\s\S]*markInsertionLiveLocalEdit\(\)/);
});

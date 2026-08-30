import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(
  new URL("../src/pages/DepotStabling.jsx", import.meta.url),
  "utf8",
);
const stylesheetSource = readFileSync(
  new URL("../src/index.css", import.meta.url),
  "utf8",
);
const referenceTableSource = readFileSync(
  new URL("../src/components/TIDReferenceTable.jsx", import.meta.url),
  "utf8",
);

const insertionCellSource = pageSource.slice(
  pageSource.indexOf("function InsertionCell"),
  pageSource.indexOf("function InsertionStablingSection"),
);
const insertionSectionSource = pageSource.slice(
  pageSource.indexOf("function InsertionStablingSection"),
  pageSource.indexOf("function RemovalSummaryTooltip"),
);

test("INS cards use the Train Request visual hierarchy", () => {
  assert.match(insertionCellSource, /theme-stabling-train-card theme-insertion-card is-req-layout/);
  assert.match(insertionCellSource, /theme-stabling-train-id theme-insertion-train-id w-full text-center font-black/);
  assert.match(insertionCellSource, /fontSize: key \? 17 : 10/);
  assert.match(insertionCellSource, /padding: "7px 4px"/);
  assert.match(insertionCellSource, /\? "linear-gradient\(135deg,#0f2d4a,#081e32\)"/);
  assert.match(insertionCellSource, /\? "1px solid #1e4d72"/);
});

test("Tracking ID uses a centered label before entry and centered value after entry", () => {
  assert.match(insertionCellSource, /<label[\s\S]*theme-insertion-tracking-footer is-editing/);
  assert.match(insertionCellSource, /placeholder="Tracking ID"/);
  assert.doesNotMatch(insertionCellSource, /<span>Tracking<\/span>/);
  assert.match(insertionCellSource, /aria-label="Enter Tracking ID or special insertion code"/);
  assert.match(insertionCellSource, /theme-insertion-tracking-footer is-complete[\s\S]*String\(insertedTrackingId\)\.padStart\(3, "0"\)/);
  assert.match(stylesheetSource, /\.theme-insertion-tracking-footer \{[\s\S]*min-height: 24px/);
  assert.match(stylesheetSource, /\.theme-insertion-tracking-footer \{[\s\S]*justify-content: center/);
  assert.match(stylesheetSource, /\.theme-insertion-tracking-footer \{[\s\S]*border-radius: 7px/);
  assert.match(stylesheetSource, /\.theme-insertion-tracking-footer \{[\s\S]*background: rgba\(3, 17, 29, 0\.78\)/);
  assert.match(stylesheetSource, /\.theme-insertion-tracking-footer input\.theme-insertion-tid-input \{[\s\S]*width: 100% !important/);
  assert.match(stylesheetSource, /\.theme-insertion-tracking-footer input\.theme-insertion-tid-input \{[\s\S]*border: 0 !important/);
  assert.match(stylesheetSource, /\.theme-insertion-tracking-footer input\.theme-insertion-tid-input \{[\s\S]*background: transparent !important/);
  assert.match(stylesheetSource, /\.theme-insertion-tracking-footer input\.theme-insertion-tid-input \{[\s\S]*text-align: center !important/);
  assert.match(stylesheetSource, /\.theme-insertion-tracking-footer > strong \{[\s\S]*font-size: 11px/);
});

test("matched Tracking IDs inherit their TID Reference Table service colour", () => {
  assert.match(
    insertionCellSource,
    /getTidAssistRemark\(insertedTrackingId, autoTidDepot\)/,
  );
  assert.match(
    insertionCellSource,
    /const insertedTrackingReferenceStyle = insertedTrackingId && insertedTrackingRemarkStyle/,
  );
  assert.match(insertionCellSource, /"--insertion-tracking-reference-bg": insertedTrackingReferencePillStyle\.bg/);
  assert.match(insertionCellSource, /"--insertion-tracking-reference-border": insertedTrackingReferencePillStyle\.border/);
  assert.match(insertionCellSource, /"--insertion-tracking-reference-color": insertedTrackingReferencePillStyle\.color/);
  assert.match(insertionCellSource, /"--insertion-tracking-reference-light-color": insertedTrackingReferencePillStyle\.lightColor/);
  assert.match(referenceTableSource, /\{ tid: 205, remark: "Late Rem"/);
  assert.match(referenceTableSource, /\{ tid: 208, remark: "ED"/);
  assert.match(pageSource, /"Late Rem": \{[\s\S]*?border: "#facc15"/);
  assert.match(pageSource, /"Late Rem": \{[\s\S]*?lightColor: "#854d0e"/);
  assert.match(pageSource, /\n  ED: \{[\s\S]*?border: "#f87171"/);
  assert.match(pageSource, /\n  ED: \{[\s\S]*?lightColor: "#991b1b"/);
  assert.equal(
    (insertionCellSource.match(/has-reference-style/g) || []).length,
    2,
    "normal and elapsed completed TID boxes should both receive the reference colour",
  );
  assert.match(
    stylesheetSource,
    /html\[data-app-theme="light"\] \.theme-insertion-page \.theme-insertion-tracking-footer\.is-complete\.has-reference-style \{[\s\S]*background: var\(--insertion-tracking-reference-bg\) !important/,
  );
  assert.match(
    stylesheetSource,
    /html\[data-app-theme="light"\] \.theme-insertion-page \.theme-insertion-tracking-footer\.is-complete\.has-reference-style > strong \{[\s\S]*color: var\(--insertion-tracking-reference-light-color, var\(--insertion-tracking-reference-color\)\) !important/,
  );
});

test("submitted numeric Tracking IDs persist even without an active timetable match", () => {
  assert.match(pageSource, /function getInsertionTrackingId\(entry = null\)/);
  assert.match(pageSource, /source\.match\(\/\^\(\?:TID/);
  assert.match(insertionCellSource, /const insertedTrackingId = getInsertionTrackingId\(inserted\) \?\? insertedTid/);
  assert.match(insertionCellSource, /\{insertedTrackingId && \(/);
  assert.match(insertionSectionSource, /rowTrackingId \? 76/);
});

test("submitted Tracking ID completion does not render Time or TA Name controls", () => {
  assert.match(insertionCellSource, /\{inserted && !inserted\.isSweeping && !insertedTrackingId && \(/);
  assert.doesNotMatch(
    insertionCellSource,
    /\{insertedTrackingId && \([\s\S]*?onInsertionTimeUpdate[\s\S]*?theme-insertion-tracking-footer is-complete/,
  );
});

test("INS operational remarks use full request labels above Tracking", () => {
  assert.match(insertionCellSource, /getMainStablingRemarkLabel\(item\)/);
  assert.match(insertionCellSource, /insertedTidAssistDisplayRemark \? \[insertedTidAssistDisplayRemark\]/);
  assert.match(insertionCellSource, /getMainStablingRemarkPillStyle\(item\)/);
  assert.match(insertionCellSource, /theme-stabling-remark block w-full/);
  assert.match(insertionCellSource, /theme-stabling-remark-tooltip-text/);
  assert.match(insertionSectionSource, /Math\.min\(rowStatusLabels\.size, 3\)/);
  assert.match(insertionSectionSource, /rowTrackingId \? 76/);
});

test("INS shows Log Insertion only for Sweep and 3K1 manual inputs", () => {
  assert.match(pageSource, /function isManualInsertionActionRemark\(value\) \{[\s\S]*isSweepRemark\(value\) \|\| getEastInsertionKeywordRemarkLabel\(value\) === "3K1"/);
  assert.match(insertionCellSource, /const canLogManualInsertion = Boolean\([\s\S]*!canAutoInsertTid[\s\S]*isManualInsertionActionRemark\(tidRemarkText\)/);
  assert.match(insertionCellSource, /\{canLogManualInsertion && \([\s\S]*theme-insertion-insert-button[\s\S]*>\s*Log Insertion\s*</);
  assert.match(insertionCellSource, /event\.key === "Enter" && !canAutoInsertTid && tidRemarkText/);
  assert.match(insertionCellSource, /handleInsertClick\(\)/);
  assert.match(insertionSectionSource, /rowHasManualInsertionAction[\s\S]*isManualInsertionActionRemark\(tidInputs\[/);
});

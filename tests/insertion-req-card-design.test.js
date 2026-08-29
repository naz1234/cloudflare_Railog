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

const insertionCellSource = pageSource.slice(
  pageSource.indexOf("function InsertionCell"),
  pageSource.indexOf("function InsertionStablingSection"),
);
const insertionSectionSource = pageSource.slice(
  pageSource.indexOf("function InsertionStablingSection"),
  pageSource.indexOf("function RemovalSummaryTooltip"),
);

test("INS cards use the Train Request visual hierarchy", () => {
  assert.match(insertionCellSource, /theme-insertion-card is-req-layout/);
  assert.match(insertionCellSource, /theme-insertion-train-id w-full text-center font-black/);
  assert.match(insertionCellSource, /fontSize: key \? 17 : 10/);
  assert.match(stylesheetSource, /\.theme-insertion-card\.is-req-layout \{[\s\S]*linear-gradient\(135deg, #0f2d4a, #081e32\)/);
});

test("Tracking ID is isolated in a slim footer", () => {
  assert.match(insertionCellSource, /theme-insertion-tracking-footer is-editing/);
  assert.match(insertionCellSource, /<span>Tracking<\/span>[\s\S]*placeholder="TID \/ Remark"/);
  assert.match(insertionCellSource, /theme-insertion-tracking-footer is-complete[\s\S]*String\(insertedTid\)\.padStart\(3, "0"\)/);
  assert.match(stylesheetSource, /\.theme-insertion-tracking-footer \{[\s\S]*min-height: 24px/);
});

test("valid TID completion does not render Time or TA Name controls", () => {
  assert.match(insertionCellSource, /\{inserted && !inserted\.isSweeping && !insertedTid && \(/);
  assert.doesNotMatch(
    insertionCellSource,
    /\{insertedTid && \([\s\S]*?onInsertionTimeUpdate[\s\S]*?theme-insertion-tracking-footer is-complete/,
  );
});

test("INS operational remarks use full request labels above Tracking", () => {
  assert.match(insertionCellSource, /item\.badgeText \|\| item\.remark \|\| item\.displayType \|\| item\.typeKey/);
  assert.match(insertionCellSource, /insertedTidAssistDisplayRemark \? \[insertedTidAssistDisplayRemark\]/);
  assert.match(insertionCellSource, /theme-insertion-card-request-list flex w-full shrink-0 flex-col/);
  assert.match(insertionSectionSource, /Math\.min\(rowStatusLabels\.size, 3\)/);
  assert.match(insertionSectionSource, /rowHasValidTid \? 76/);
});

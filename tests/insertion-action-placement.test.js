import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const depotStablingSource = readFileSync(
  new URL("../src/pages/DepotStabling.jsx", import.meta.url),
  "utf8",
);

const insertionSection = depotStablingSource.slice(
  depotStablingSource.indexOf("function InsertionStablingSection"),
  depotStablingSource.indexOf("function InsertionTabContent"),
);

test("Insertion places the three depot actions between the summary and train search", () => {
  const titleIndex = insertionSection.indexOf("<InsertionSectionTitle");
  const summaryIndex = insertionSection.indexOf('className="theme-insertion-stabling-summary');
  const actionsIndex = insertionSection.indexOf('className="theme-insertion-search-actions');
  const searchIndex = insertionSection.indexOf("theme-stabling-search theme-insertion-search");

  assert.ok(titleIndex >= 0);
  assert.ok(summaryIndex > titleIndex);
  assert.ok(actionsIndex > summaryIndex);
  assert.ok(searchIndex > actionsIndex);
});

test("Insertion action row keeps all existing controls and handlers", () => {
  const actionsIndex = insertionSection.indexOf('className="theme-insertion-search-actions');
  const searchIndex = insertionSection.indexOf("theme-stabling-search theme-insertion-search");
  const actionRow = insertionSection.slice(actionsIndex, searchIndex);
  const titleBlock = insertionSection.slice(
    insertionSection.indexOf("<InsertionSectionTitle"),
    insertionSection.indexOf('className="theme-insertion-stabling-summary'),
  );

  assert.match(actionRow, /style=\{\{ width: 880 \}\}/);
  assert.match(actionRow, /role="group"/);
  assert.match(actionRow, /onClick=\{handleDownloadPng\}/);
  assert.match(actionRow, /theme-insertion-download/);
  assert.match(actionRow, /onClick=\{handleClearAllTid\}/);
  assert.match(actionRow, /theme-insertion-clear/);
  assert.match(actionRow, /setHideElapsedTid/);
  assert.match(actionRow, /theme-insertion-hide/);
  assert.doesNotMatch(titleBlock, /theme-insertion-(?:download|clear|hide)/);
});

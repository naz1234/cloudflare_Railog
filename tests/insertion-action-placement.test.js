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

test("Insertion retains the mobile DOM order of remark note, depot actions and train search", () => {
  const titleIndex = insertionSection.indexOf("<InsertionSectionTitle");
  const noteIndex = insertionSection.indexOf('className="insertion-tracking-remark-note');
  const actionsIndex = insertionSection.indexOf('className="theme-insertion-search-actions');
  const searchIndex = insertionSection.indexOf("theme-stabling-search theme-insertion-search");

  assert.ok(titleIndex >= 0);
  assert.ok(noteIndex > titleIndex);
  assert.ok(actionsIndex > noteIndex);
  assert.ok(searchIndex > actionsIndex);
});

test("Insertion action row keeps all existing controls and handlers", () => {
  const actionsIndex = insertionSection.indexOf('className="theme-insertion-search-actions');
  const searchIndex = insertionSection.indexOf("theme-stabling-search theme-insertion-search");
  const actionRow = insertionSection.slice(actionsIndex, searchIndex);
  const titleBlock = insertionSection.slice(
    insertionSection.indexOf("<InsertionSectionTitle"),
    insertionSection.indexOf('className="insertion-tracking-remark-note'),
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

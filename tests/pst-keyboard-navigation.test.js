import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = source.indexOf("\nfunction ", start + 1);
  assert.ok(end > start, `${name} must have a following function`);
  return source.slice(start, end);
}

const targetHelperSource = functionSource("getPSTArrowNavigationTarget");
const caretHelperSource = functionSource("shouldNavigatePSTGridInput");
const cellSource = functionSource("PSTCell");
const sectionSource = functionSource("PSTStablingSection");
const getTarget = new Function(`${targetHelperSource}\nreturn getPSTArrowNavigationTarget;`)();
const shouldNavigate = new Function(`${caretHelperSource}\nreturn shouldNavigatePSTGridInput;`)();

test("PST arrow directions resolve to adjacent cards without wrapping", () => {
  assert.deepEqual(getTarget("ArrowLeft", 1, 3, 4, 7), { rowIndex: 1, columnIndex: 2 });
  assert.deepEqual(getTarget("ArrowRight", 1, 3, 4, 7), { rowIndex: 1, columnIndex: 4 });
  assert.deepEqual(getTarget("ArrowUp", 1, 3, 4, 7), { rowIndex: 0, columnIndex: 3 });
  assert.deepEqual(getTarget("ArrowDown", 1, 3, 4, 7), { rowIndex: 2, columnIndex: 3 });
  assert.equal(getTarget("ArrowLeft", 0, 0, 4, 7), null);
  assert.equal(getTarget("ArrowUp", 0, 0, 4, 7), null);
  assert.equal(getTarget("ArrowRight", 3, 6, 4, 7), null);
  assert.equal(getTarget("ArrowDown", 3, 6, 4, 7), null);
});

test("Train ID arrows always navigate while detail fields retain caret editing", () => {
  assert.equal(shouldNavigate("ArrowLeft", "train-id", 4, 2, 2), true);
  assert.equal(shouldNavigate("ArrowRight", "train-id", 4, 0, 4), true);
  assert.equal(shouldNavigate("ArrowLeft", "ta-name", 4, 0, 0), true);
  assert.equal(shouldNavigate("ArrowLeft", "ta-name", 4, 2, 2), false);
  assert.equal(shouldNavigate("ArrowRight", "pst-start", 4, 4, 4), true);
  assert.equal(shouldNavigate("ArrowRight", "pst-start", 4, 2, 2), false);
  assert.equal(shouldNavigate("ArrowRight", "prep-end", 4, 0, 4), false);
  assert.equal(shouldNavigate("ArrowUp", "ta-name", 4, 2, 2), true);
  assert.equal(shouldNavigate("ArrowDown", "ta-name", 4, 2, 2), true);
});

test("PST inputs expose coordinates and the section moves focus by arrow key", () => {
  for (const field of ["train-id", "pst-start", "prep-end", "ta-name"]) {
    assert.match(cellSource, new RegExp(`gridNavigationProps\\("${field}"\\)`));
  }
  assert.match(cellSource, /"aria-keyshortcuts": "ArrowLeft ArrowRight ArrowUp ArrowDown"/);
  assert.match(sectionSource, /onKeyDown=\{handleGridArrowNavigation\}/);
  assert.match(sectionSource, /currentInput\.dataset\.pstGridRow/);
  assert.match(sectionSource, /currentInput\.dataset\.pstGridColumn/);
  assert.match(sectionSource, /nextInput\.focus\(\)/);
  assert.match(sectionSource, /nextInput\.select\?\.\(\)/);
  assert.match(sectionSource, /data-pst-grid-input="train-id"/);
});

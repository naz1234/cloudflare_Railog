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

const targetHelperSource = functionSource("getInsertionArrowNavigationTarget");
const cellSource = functionSource("InsertionCell");
const sectionSource = functionSource("InsertionStablingSection");
const getTarget = new Function(`${targetHelperSource}\nreturn getInsertionArrowNavigationTarget;`)();

test("Insertion arrow directions resolve to adjacent cards without wrapping", () => {
  assert.deepEqual(getTarget("ArrowLeft", 1, 3, 4, 7), { rowIndex: 1, columnIndex: 2 });
  assert.deepEqual(getTarget("ArrowRight", 1, 3, 4, 7), { rowIndex: 1, columnIndex: 4 });
  assert.deepEqual(getTarget("ArrowUp", 1, 3, 4, 7), { rowIndex: 0, columnIndex: 3 });
  assert.deepEqual(getTarget("ArrowDown", 1, 3, 4, 7), { rowIndex: 2, columnIndex: 3 });
  assert.equal(getTarget("ArrowLeft", 0, 0, 4, 7), null);
  assert.equal(getTarget("ArrowUp", 0, 0, 4, 7), null);
  assert.equal(getTarget("ArrowRight", 3, 6, 4, 7), null);
  assert.equal(getTarget("ArrowDown", 3, 6, 4, 7), null);
  assert.equal(getTarget("Enter", 1, 3, 4, 7), null);
});

test("Insertion Train ID controls expose arrow-key navigation", () => {
  assert.match(cellSource, /ref=\{trainIdControlRef\}[\s\S]*onKeyDown=\{onTrainIdKeyDown\}[\s\S]*aria-label="Train ID"/);
  assert.match(cellSource, /<button[\s\S]*ref=\{trainIdControlRef\}[\s\S]*onKeyDown=\{onTrainIdKeyDown\}[\s\S]*aria-label=\{`Add train/);
  assert.match(cellSource, /aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"/);
});

test("both Insertion depot grids wire card coordinates to focus movement", () => {
  assert.match(sectionSource, /const trainIdControlRefs = useRef\(\{\}\)/);
  assert.match(sectionSource, /trainIdControlRefs\.current\[`\$\{roadIdx\}-\$\{colIdx\}`\]/);
  assert.match(sectionSource, /getInsertionArrowNavigationTarget\(/);
  assert.match(sectionSource, /control\.focus\(\)/);
  assert.match(sectionSource, /control\.select\?\.\(\)/);
  assert.match(sectionSource, /onTrainIdKeyDown=\{\(event\) => handleTrainIdKeyDown\(event, ri, i\)\}/);
  assert.match(sectionSource, /trainIdControlRef=\{\(element\) => \{ trainIdControlRefs\.current\[`\$\{ri\}-\$\{i\}`\] = element; \}\}/);
});

test("Tracking ID keeps its existing four-direction arrow navigation", () => {
  assert.match(cellSource, /onTidKeyDown\?\.\(event\)/);
  for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
    assert.match(sectionSource, new RegExp(`e\\.key === "${key}"`));
  }
});

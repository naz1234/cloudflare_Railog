import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const source = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/pstCompletionColors.css", import.meta.url), "utf8");

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = source.indexOf("\nfunction ", start + 1);
  assert.ok(end > start, `${name} must have a following function`);
  return source.slice(start, end);
}

const section = functionSource("PSTStablingSection");
const cell = functionSource("PSTCell");
const tabStart = source.search(/function PSTTabContent\r?\n/);
const tabEnd = source.indexOf("\nfunction ", tabStart + 1);
assert.ok(tabStart >= 0 && tabEnd > tabStart);
const tab = source.slice(tabStart, tabEnd);
const searchStart = tab.indexOf("  const trainSearchKey =");
const searchEnd = tab.indexOf("  const [downloadingExcelDepot", searchStart);
assert.ok(searchStart >= 0 && searchEnd > searchStart);
const searchSource = tab.slice(searchStart, searchEnd);
const helpers = ["normalizeTrainId", "formatStablingRoadForPopup", "getMainStablingLocations"]
  .map(functionSource).join("\n");
const search = new Function("trainSearch", "westData", "eastData", "logLines", `${helpers}\n${searchSource}\nreturn { trainSearchKey, trainSearchResults };`);

test("both PST depot panels share one search value, results, and clear handler", () => {
  assert.equal((tab.match(/const \[trainSearch, setTrainSearch\] = useState\(""\)/g) || []).length, 1);
  const sections = tab.match(/<PSTStablingSection\b[^\n]+\/>/g) || [];
  assert.equal(sections.length, 2);
  for (const panel of sections) {
    assert.match(panel, /trainSearch=\{trainSearch\}/);
    assert.match(panel, /onTrainSearchChange=\{setTrainSearch\}/);
    assert.match(panel, /trainSearchResults=\{trainSearchResults\}/);
  }
  assert.match(section, /onChange=\{\(event\) => onTrainSearchChange\?\.\(event\.target\.value\)\}/);
  assert.match(section, /onClick=\{\(\) => onTrainSearchChange\?\.\(""\)\}/);
});

test("PST train search normalizes numeric, padded, lowercase, and spaced IDs", () => {
  const west = { "WD-ST15": [{ trainId: "T01" }] };
  for (const query of ["1", "01", "T1", "T01", " t 001 "]) {
    assert.deepEqual(search(query, west, {}), {
      trainSearchKey: "T1",
      trainSearchResults: ["West Depot STB 15 Block 01"],
    });
  }
});

test("PST search returns all West and East matches with actual road and block numbers", () => {
  const west = { "WD-ST2": [null, { trainId: "T007" }] };
  const east = { "ED-ST10": [null, null, null, null, null, null, { trainId: "7" }] };
  assert.deepEqual(search("T07", west, east).trainSearchResults, [
    "West Depot STB 02 Block 02",
    "East Depot STB 10 Block 07",
  ]);
});

test("PST search receives each depot's active page and updates without changing the query", () => {
  assert.match(source, /<PSTTabContent\s+westData=\{activePSTWestData\}\s+eastData=\{activePSTEastData\}/);
  assert.match(searchSource, /getMainStablingLocations\(westData, eastData\)/);
  const westPg1 = { "WD-ST1": [{ trainId: "T06" }] };
  const westPg2 = { "WD-ST4": [null, null, { trainId: "T06" }] };
  const eastPg2 = { "ED-ST3": [null, { trainId: "T06" }] };
  assert.deepEqual(search("6", westPg1, {}).trainSearchResults, ["West Depot STB 01 Block 01"]);
  assert.deepEqual(search("6", westPg2, eastPg2).trainSearchResults, [
    "West Depot STB 04 Block 03", "East Depot STB 03 Block 02",
  ]);
  assert.deepEqual(search("6", {}, eastPg2).trainSearchResults, ["East Depot STB 03 Block 02"]);
  assert.deepEqual(search("6", {}, {}).trainSearchResults, []);
});

test("empty PST queries are idle and missing IDs do not match empty blocks or object properties", () => {
  for (const query of ["", "   "]) {
    assert.deepEqual(search(query, {}, {}), { trainSearchKey: "", trainSearchResults: [] });
  }
  for (const query of ["T99", "constructor", "__proto__"]) {
    const result = search(query, { "WD-ST1": [null, { trainId: "" }] }, {});
    assert.ok(result.trainSearchKey);
    assert.deepEqual(result.trainSearchResults, []);
  }
  assert.match(section, /const searchNotFound = Boolean\(normalizedSearch && !searchFound\)/);
});

test("PST log-only trains do not appear as current train locations", () => {
  const logs = [{ trainKey: "T12", road: "WD-ST1", type: "PST" }];
  assert.deepEqual(search("12", {}, {}, logs).trainSearchResults, []);
  assert.doesNotMatch(searchSource, /\b(?:logLines|sortedLogLines|exportLogLines|pstState|prepState)\b/);
});

test("PST search is above the grid with an accessible label, clear button, and result status", () => {
  assert.match(section, /placeholder="Search train ID across both PST \/ Train Prep depots…"/);
  assert.match(section, /aria-label=\{`\$\{sectionDepotLabel\} PST \/ Train Prep: search train ID across both depots`\}/);
  assert.match(section, /aria-label=\{`Clear \$\{sectionDepotLabel\} PST \/ Train Prep train search`\}/);
  assert.match(section, /role="status" aria-live="polite"/);
  assert.match(section, /trainSearchResults\.map\(\(location\)/);
  assert.match(section, />\{location\}<\/span>/);
  assert.match(section, /not found in either PST \/ Train Prep depot/);
  assert.ok(section.indexOf("theme-pst-search") < section.indexOf("<table"));
});

test("PST card highlights use normalized IDs and clear when the search is empty", () => {
  const expression = section.match(/isSearchMatch=\{([^\n]+?)\} \/>/)?.[1];
  assert.ok(expression);
  const isMatch = new Function("query", "data", "road", "bi", `${functionSource("normalizeTrainId")}\nconst normalizedSearch = normalizeTrainId(query);\nreturn ${expression};`);
  const data = { "WD-ST1": [{ trainId: "T003" }, { trainId: "T04" }, null] };
  assert.equal(isMatch(" 3 ", data, "WD-ST1", 0), true);
  assert.equal(isMatch("T3", data, "WD-ST1", 1), false);
  assert.equal(isMatch("3", data, "WD-ST1", 2), false);
  assert.equal(isMatch("", data, "WD-ST1", 0), false);
  assert.match(cell, /isSearchMatch \? "is-search-match" : ""/);
  assert.match(cell, /isPstDone \? "is-pst-done" : isPstConfirming \? "is-pst-confirming" : isPrepDone \? "is-prep-done"/);
});

test("PST search rings work in both themes without replacing completion-state colors", () => {
  const ring = css.match(/\.theme-pst-section \.theme-pst-card\.is-search-match \{([^}]+)\}/)?.[1];
  assert.ok(ring);
  assert.match(ring, /outline: 2px solid #facc15/);
  assert.match(ring, /outline-offset: 2px/);
  assert.doesNotMatch(ring, /background|border|box-shadow/);
  assert.match(css, /html\[data-app-theme="light"\] \.theme-pst-section \.theme-pst-card\.is-search-match \{\s+outline-color: #ca8a04/);
});

// Render the actual section and cards, stubbing only the unchanged header controls/icons.
const renderSource = ts.transpileModule([
  "const { useState, useCallback } = React;",
  helpers,
  ...["normalizeInsertionPg", "normalizePSTPg", "padTrainId", "formatTrainNumberOnly"].map(functionSource),
  cell,
  section,
  "return PSTStablingSection;",
].join("\n"), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
const EmptyControl = () => null;
const Section = new Function("React", "Search", "X", "InsertionEditableHeaderControls", "RemovalSummaryTooltip", renderSource)(
  React, EmptyControl, EmptyControl, EmptyControl, EmptyControl,
);

function renderSection(query, overrides = {}) {
  const data = { "WD-ST1": [{ trainId: "T003" }, { trainId: "T04" }, null] };
  return renderToStaticMarkup(React.createElement(Section, {
    title: "WEST DEPOT — PST / TRAIN PREP",
    blockLabels: ["BLOCK 3", "BLOCK 2", "BLOCK 1"],
    blockIndices: [2, 1, 0],
    roads: ["WD-ST1"], data, labelSide: "left",
    maintenanceMap: {}, pstState: {}, prepState: {}, taNameState: {},
    trainSearch: query,
    trainSearchResults: search(query, data, {}).trainSearchResults,
    ...overrides,
  }));
}

test("rendered PST search highlights only the matching card and preserves every work status", () => {
  const states = [
    [{}, "is-normal"],
    [{ pstState: { "WD-ST1-0": { trainKey: "T3", confirming: true } } }, "is-pst-confirming"],
    [{ pstState: { "WD-ST1-0": { trainKey: "T3", done: true } } }, "is-pst-done"],
    [{ prepState: { "WD-ST1-0": { trainKey: "T3", done: true } } }, "is-prep-done"],
  ];
  for (const [overrides, status] of states) {
    const html = renderSection(" t 03 ", overrides);
    assert.equal((html.match(/theme-pst-card is-search-match/g) || []).length, 1);
    assert.match(html, new RegExp(`class="theme-pst-card is-search-match [^"]*${status}"`));
    assert.match(html, /West Depot STB 01 Block 01/);
    assert.match(html, /role="status" aria-live="polite"/);
  }
});

test("rendered PST empty and not-found searches have no highlighted cards", () => {
  const idle = renderSection("");
  assert.doesNotMatch(idle, /is-search-match|role="status"|title="Clear search"/);
  const missing = renderSection("T99");
  assert.match(missing, /T99 not found in either PST \/ Train Prep depot/);
  assert.match(missing, /title="Clear search"/);
  assert.doesNotMatch(missing, /is-search-match/);
});

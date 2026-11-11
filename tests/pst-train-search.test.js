import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { parseStablingTrainSearch } from "../src/lib/stablingTrainSearch.js";

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
const searchStart = tab.indexOf("  const trainSearchKeys =");
const searchEnd = tab.indexOf("  const [downloadingExcelDepot", searchStart);
assert.ok(searchStart >= 0 && searchEnd > searchStart);
const searchSource = tab.slice(searchStart, searchEnd);
const helpers = ["normalizeTrainId", "formatStablingRoadForPopup", "getMainStablingLocations"]
  .map(functionSource).join("\n");
const lookup = new Function("parseStablingTrainSearch", `return (trainSearch, westData, eastData, logLines = []) => { ${helpers}\n${searchSource}\nreturn { trainSearchKeys, trainSearchResults }; };`)(parseStablingTrainSearch);
const search = (...args) => {
  const result = lookup(...args);
  return { trainSearchKey: result.trainSearchKeys[0] || "", trainSearchResults: result.trainSearchResults.map(item => item.location) };
};

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
    assert.equal(result.trainSearchKey, "");
    assert.deepEqual(result.trainSearchResults, []);
  }
  assert.match(section, /const searchNotFound = searched && !searchFound/);
});

test("PST log-only trains do not appear as current train locations", () => {
  const logs = [{ trainKey: "T12", road: "WD-ST1", type: "PST" }];
  assert.deepEqual(search("12", {}, {}, logs).trainSearchResults, []);
  assert.doesNotMatch(searchSource, /\b(?:logLines|sortedLogLines|exportLogLines|pstState|prepState)\b/);
});

test("PST search is above the grid with an accessible label, clear button, and result status", () => {
  assert.match(section, /placeholder="Search trains, e.g. 01 02 03"/);
  assert.match(section, /aria-label=\{`\$\{sectionDepotLabel\} PST \/ Train Prep: search train numbers across both depots`\}/);
  assert.match(section, /aria-label=\{`Clear \$\{sectionDepotLabel\} PST \/ Train Prep train search`\}/);
  assert.match(section, /role="status" aria-live="polite"/);
  assert.match(section, /trainSearchResults\.map\(\(\{ trainKey, location \}\)/);
  assert.match(section, />\{location\}<\/span>/);
  assert.match(section, /not found in either PST \/ Train Prep depot/);
  assert.ok(section.indexOf("theme-pst-search") < section.indexOf("<table"));
});

test("PST card highlights use normalized IDs and clear when the search is empty", () => {
  const expression = section.match(/isSearchMatch=\{([^\n]+?)\} \/>/)?.[1];
  assert.ok(expression);
  const isMatch = new Function("parseStablingTrainSearch", `return (query, data, road, bi) => { ${functionSource("normalizeTrainId")}\nconst searchTrainKeys = new Set(parseStablingTrainSearch(query).trainKeys);\nreturn ${expression}; };`)(parseStablingTrainSearch);
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
  "const { useState, useCallback, useMemo } = React;",
  helpers,
  ...["normalizeInsertionPg", "normalizePSTPg", "padTrainId", "formatTrainNumberOnly"].map(functionSource),
  cell,
  section,
  "return PSTStablingSection;",
].join("\n"), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
const EmptyControl = () => null;
const Section = new Function("React", "Search", "X", "InsertionEditableHeaderControls", "RemovalSummaryTooltip", "parseStablingTrainSearch", renderSource)(
  React, EmptyControl, EmptyControl, EmptyControl, EmptyControl, parseStablingTrainSearch,
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
    trainSearchResults: lookup(query, data, {}).trainSearchResults,
    ...overrides,
  }));
}

test("actual PST grids flag only matching REQ APU trains without rendering REQ remark pills", () => {
  for (const depot of ['west', 'east']) {
    const road = depot === 'west' ? 'WD-ST15' : 'ED-ST02';
    const html = renderSection('', {
      title: `${depot.toUpperCase()} DEPOT — PST / TRAIN PREP`,
      roads: [road], labelSide: depot === 'west' ? 'left' : 'right',
      data: { [road]: [{ trainId: 'T003' }, { trainId: 'T04' }, null] },
      reqApuTrainKeys: new Set(['T3']),
    });
    assert.equal((html.match(/has-apu-remark/g) || []).length, 1);
    assert.equal((html.match(/class="theme-pst-card/g) || []).length, 3);
    assert.doesNotMatch(html, /theme-pst-request-remark|APU|is-unfit/);
    assert.doesNotMatch(renderSection('', { reqApuTrainKeys: new Set(['T99']) }), /has-apu-remark/);
  }
});

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
  const missing = renderSection("T47");
  assert.match(missing, /47 not found in either PST \/ Train Prep depot/);
  assert.match(missing, /title="Clear search"/);
  assert.doesNotMatch(missing, /is-search-match/);
});

test("PST cells expose actual block labels and accessible editable train IDs", () => {
  const html = renderSection("", { stablingEditable: true });
  assert.deepEqual([...html.matchAll(/data-mobile-block-label="([^"]+)"/g)].map(match => match[1]), ["Block 3", "Block 2", "Block 1"]);
  assert.match(html, /aria-label="WD-ST1 Block 1 train ID"/);
  assert.match(html, /aria-label="WD-ST1 Block 2 train ID"/);
  assert.match(html, /theme-pst-controls flex flex-col/);
  assert.deepEqual([...html.matchAll(/class="theme-pst-mobile-block req-mobile-only">([^<]+)</g)].map(match => match[1]), ["Block 3", "Block 2", "Block 1"]);
});

test("PST search uses a phone-sized hint while retaining its full cross-depot accessible label", () => {
  const html = renderSection("");
  assert.match(html, /placeholder="Search trains, e.g. 01 02 03"/);
  assert.match(html, /aria-label="West Depot PST \/ Train Prep: search train numbers across both depots"/);
});

test("PST multi-train lookup deduplicates queries and labels each train's current locations", () => {
  const west = { "WD-ST15": [{ trainId: "T03" }, { trainId: "04" }] };
  const east = { "ED-ST02": [{ trainId: "T04" }, { trainId: "06" }] };
  assert.deepEqual(lookup("03,04 T003 47", west, east), {
    trainSearchKeys: ["T3", "T4", "T47"], trainSearchResults: [
      { trainKey: "T3", location: "West Depot STB 15 Block 01" },
      { trainKey: "T4", location: "West Depot STB 15 Block 02" },
      { trainKey: "T4", location: "East Depot STB 02 Block 01" },
    ],
  });
});

test("both real PST grids highlight multiple trains without losing other trains or completion state", () => {
  const west = { "WD-ST1": [{ trainId: "T03" }, { trainId: "04" }, null] };
  const east = { "ED-ST02": [{ trainId: "T04" }, { trainId: "06" }, null] };
  const before = structuredClone({ west, east });
  const trainSearchResults = lookup("03 04 47", west, east).trainSearchResults;
  for (const [depot, data, road, matches] of [["West", west, "WD-ST1", 2], ["East", east, "ED-ST02", 1]]) {
    const html = renderSection("03 04 47", { title: `${depot.toUpperCase()} DEPOT — PST / TRAIN PREP`, data, roads: [road],
      labelSide: depot === "West" ? "left" : "right", trainSearchResults,
      pstState: { [`${road}-0`]: { trainKey: depot === "West" ? "T3" : "T4", done: true } } });
    assert.equal((html.match(/theme-pst-card is-search-match/g) || []).length, matches);
    assert.equal((html.match(/class="theme-pst-card/g) || []).length, 3);
    assert.match(html, /is-pst-done/);
    assert.match(html, /47 not found in either PST \/ Train Prep depot/);
    assert.match(html, /West Depot STB 01 Block 01/);
    assert.match(html, /East Depot STB 02 Block 01/);
  }
  assert.deepEqual({ west, east }, before);
});

test("PST mixed invalid input preserves valid matches and Escape clears the shared query", () => {
  const html = renderSection("03 BAD");
  assert.equal((html.match(/theme-pst-card is-search-match/g) || []).length, 1);
  assert.match(html, /Use train numbers 01–47/);
  assert.match(section, /event\.key === "Escape"\) onTrainSearchChange\?\.\(""\)/);
  assert.match(section, /maxLength=\{512\}/);
});

test("both PST grids fill the panel instead of leaving space after the last block", () => {
  for (const depot of ["west", "east"]) {
    const isWest = depot === "west";
    const blockIndices = isWest ? [6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6];
    const road = isWest ? "WD-ST15" : "ED-ST02";
    const html = renderSection("", {
      title: `${isWest ? "WEST" : "EAST"} DEPOT — PST / TRAIN PREP`,
      blockIndices,
      blockLabels: blockIndices.map((index) => `BLOCK ${index + 1}`),
      roads: [road],
      data: { [road]: Array.from({ length: 7 }, (_, index) => ({ trainId: `T${index + 1}` })) },
      labelSide: isWest ? "left" : "right",
    });
    const table = html.match(/<table\b[^>]+>/)?.[0];
    assert.ok(table);
    // Leave a two-pixel rounding allowance inside the 954px frame at browser
    // zoom levels that round its content box just below 912px.
    assert.match(table, /style="min-width:910px;width:100%"/);
    assert.doesNotMatch(table, /max-width:912px|(?:^|;)width:912px/);

    const headers = [...html.matchAll(/<th\b[^>]*class="theme-stabling-block-header[^>]+>/g)];
    assert.equal(headers.length, 7);
    for (const [header] of headers) {
      // Fixed table layout shares the remaining width equally once the road
      // column is reserved. Percentage column calculations can feed back into
      // max-content ancestors and expand each train card beyond the viewport.
      assert.doesNotMatch(header, /(?:^|[;"-])width:|calc\(/);
    }
    assert.match(html, /<th class="w-\[72px\]"/);
    assert.match(html, /<section\b[^>]*style="width:100%;max-width:100%;min-width:0"/);
    assert.match(html, /mobile-section-header flex flex-wrap/);
    assert.doesNotMatch(section, /width: "fit-content"|maxWidth: "fit-content"/);
    assert.deepEqual(
      [...html.matchAll(/data-mobile-block-label="([^"]+)"/g)].map((match) => match[1]),
      blockIndices.map((index) => `Block ${index + 1}`),
    );
  }
});

test("PST desktop columns have a bounded parent instead of a max-content sizing loop", () => {
  assert.match(tab, /mobile-pst-workspace flex w-full min-w-0/);
  const depotGrids = tab.match(/<div data-mobile-depot="(?:west|east)"[^>]+>/g) || [];
  assert.equal(depotGrids.length, 2);
  for (const grid of depotGrids) {
    assert.match(grid, /grid w-full min-w-0/);
    assert.match(grid, /pst-depot-layout/);
    assert.match(grid, /grid-cols-1 gap-3/);
    assert.doesNotMatch(grid, /w-fit|max-content/);
  }
});

test("PST full-width grids retain the phone road-list overrides", () => {
  const mobileCss = readFileSync(new URL("../src/mobileWorkspaces.css", import.meta.url), "utf8");
  assert.match(mobileCss, /@media \(max-width: 767px\)/);
  assert.match(mobileCss, /:is\(\.theme-stabling-table,\.theme-insertion-table\) \{ display: block; width: 100% !important; min-width: 0 !important; max-width: 100% !important;/);
  assert.match(mobileCss, /:is\(\.theme-stabling-table,\.theme-insertion-table\) thead \{ display: none; \}/);
  assert.match(mobileCss, /:is\(\.theme-stabling-table,\.theme-insertion-table\) tr \{ display: flex; flex-direction: column;/);
});

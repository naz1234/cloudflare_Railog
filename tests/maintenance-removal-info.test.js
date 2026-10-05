import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildWestRemovalInfoByTrain } from "../src/lib/maintenanceRemovalInfo.js";

const panel = readFileSync(new URL("../src/components/MaintenancePanel.jsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");
const tooltip = readFileSync(new URL("../src/components/WestRemovalInfo.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");

test("West removal information matches padded and T-prefixed train IDs", () => {
  const result = buildWestRemovalInfoByTrain([
    { trainId: "T04", tid: "212", timing: "09:03" },
    { trainId: "47", tid: 214, timing: "09:09" },
    { trainId: "T035", tid: "TID 216", timing: "9:15" },
    { trainId: 32, tid: "218", timing: "09:21" },
  ]);
  assert.deepEqual([...result.entries()], [
    ["04", [{ tid: "212", timing: "09:03" }]],
    ["47", [{ tid: "214", timing: "09:09" }]],
    ["35", [{ tid: "216", timing: "09:15" }]],
    ["32", [{ tid: "218", timing: "09:21" }]],
  ]);
  assert.equal(result.has("11"), false);
});

test("blank, TID-less HDW and malformed rows never display an info indicator", () => {
  assert.equal(buildWestRemovalInfoByTrain().size, 0);
  assert.equal(buildWestRemovalInfoByTrain(null).size, 0);
  assert.equal(buildWestRemovalInfoByTrain([
    null, {}, { trainId: "35", tid: "" }, { trainId: "", tid: "216" },
    { trainId: "T00", tid: "216" }, { trainId: "T35", tid: "000" },
    { trainId: "TRAIN", tid: "216" }, { trainId: "35", tid: "invalid" },
    { trainId: "35", tid: "1234" },
  ]).size, 0);
});

test("different removals for the same train remain visible and missing times are not fabricated", () => {
  const rows = [
    { trainId: "35", tid: "016", timing: "09:15" },
    { trainId: "T35", tid: 16, timing: "09:15" },
    { trainId: "T35", tid: "216", timing: "25:80" },
  ];
  const before = JSON.stringify(rows);
  assert.deepEqual(buildWestRemovalInfoByTrain(rows).get("35"), [
    { tid: "016", timing: "09:15" }, { tid: "216", timing: "" },
  ]);
  assert.equal(JSON.stringify(rows), before);
});

test("info disappears or changes when the current Removal Summary rows change", () => {
  const oldRows = [{ trainId: "35", tid: "216", timing: "09:15" }];
  assert.equal(buildWestRemovalInfoByTrain(oldRows).get("35")[0].tid, "216");
  assert.equal(buildWestRemovalInfoByTrain([]).has("35"), false);
  assert.deepEqual(buildWestRemovalInfoByTrain([{ trainId: "47", tid: "213", timing: "19:06" }]).get("47"), [
    { tid: "213", timing: "19:06" },
  ]);
});

test("only the main Train Request sidebar receives active West removal data", () => {
  assert.match(page, /getWestRemovalRowsMap\(trainRemCheckState, activeTimetable\)/);
  assert.match(page, /\[trainRemCheckState, activeTimetable\],/);
  assert.equal((page.match(/westRemovalRows=\{westRemovalInfoRows\}/g) || []).length, 1);
  assert.match(panel, /westRemovalRows = \[\]/);
  assert.match(panel, /buildWestRemovalInfoByTrain\(westRemovalRows\)/);
  assert.match(panel, /westRemovalInfoByTrain\.get\(normalizeTrainCompareKey\(req\.trainId\)\)/);
  const row = panel.slice(panel.indexOf("const chipLabel = getRequestChipTrainLabel(req);"), panel.indexOf("const renderRequestGroupCards"));
  assert.match(row, /westRemovals\?\.length > 0/);
  assert.ok(row.indexOf("<WestRemovalInfo") < row.indexOf("<AlreadyStatusIcon"));
  assert.ok(row.indexOf("<WestRemovalInfo") < row.indexOf("<StillNotAtStablingIcon"));
  assert.match(row, /<DeleteRequestButton/);
});

test("tooltip is focus-accessible, portalled, collision-aware and matches the approved content", () => {
  assert.match(tooltip, /TooltipPrimitive\.Trigger asChild/);
  assert.match(tooltip, /<button\s+type="button"/);
  assert.match(tooltip, /aria-label=\{`West Depot Removal for/);
  assert.match(tooltip, /TooltipPrimitive\.Portal/);
  assert.match(tooltip, /side="right"/);
  assert.match(tooltip, /sideOffset=\{6\}/);
  assert.match(tooltip, /collisionPadding=\{10\}/);
  for (const text of ["West Depot Removal", "TID {tid}", "Removal time:", "From Removal Summary"]) {
    assert.ok(tooltip.includes(text));
  }
  assert.match(css, /\.theme-west-removal-info-trigger:focus-visible/);
  assert.match(css, /\.theme-west-removal-info-trigger \{[\s\S]*?color: #22d3ee;/);
  assert.match(css, /html\[data-app-theme="light"\] \.theme-west-removal-info-trigger svg \*/);
  assert.match(css, /\.theme-west-removal-info-tooltip \{[\s\S]*?background: #071e30;/);
  assert.match(css, /html\[data-app-theme="light"\] \.theme-west-removal-info-tooltip \{[\s\S]*?background: #ffffff;/);
});

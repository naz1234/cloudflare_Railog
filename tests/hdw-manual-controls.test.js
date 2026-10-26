import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RefreshCw } from "lucide-react";
import ts from "typescript";
import { getHdwRunningInMlCount, normalizeHdw40Rows } from "../src/lib/trainRemHdw40.js";

const source = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");
const start = source.indexOf("{isHdw40 ? <>");
const end = source.indexOf("</> : <input", start);
assert.ok(start >= 0 && end > start);
const jsx = source.slice(start + "{isHdw40 ? ".length, end + 3);
const compiled = ts.transpileModule(`export default function Controls({row,index,depot,timingTextColor,updateTrainRemCell,handleTrainRemOtherFieldFocus,cleanMovementCustomTimeInput,normalizeMovementCustomTimeInput,handleTrainRemEditStart,handleTrainRemEditEnd,getHdwCurrentTime,RefreshCw}) { return (${jsx}); }`, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, fileName: "HdwControls.jsx",
}).outputText;
const controlsModule = { exports: {} };
new Function("require", "module", "exports", compiled)(createRequire(import.meta.url), controlsModule, controlsModule.exports);
const Controls = controlsModule.exports.default;
const timeHelpers = {};
vm.createContext(timeHelpers);
for (const name of ["cleanMovementCustomTimeInput", "normalizeMovementCustomTimeInput"]) {
  const functionStart = source.indexOf(`function ${name}(`);
  vm.runInContext(source.slice(functionStart, source.indexOf("\n}", functionStart) + 2), timeHelpers);
}

function harness(index = 0, row = { timing: "", hdwDepot: "" }) {
  const changes = [];
  const events = [];
  const props = { row, index, depot: "west", timingTextColor: "#fff", RefreshCw, ...timeHelpers,
    updateTrainRemCell: (...args) => changes.push(args), getHdwCurrentTime: () => "16:27",
    handleTrainRemOtherFieldFocus: () => events.push("focus"), handleTrainRemEditStart: () => events.push("start"), handleTrainRemEditEnd: () => events.push("end") };
  const tree = Controls(props);
  const nodes = [];
  const walk = (node) => {
    if (!React.isValidElement(node)) return;
    nodes.push(node);
    React.Children.toArray(node.props.children).forEach(walk);
  };
  walk(tree);
  return { changes, events, props, nodes };
}

test("all 40 HDW rows render a blank editable time, refresh button and West/East depot choice", () => {
  const rows = normalizeHdw40Rows();
  const html = rows.map((row, index) => renderToStaticMarkup(React.createElement(Controls, harness(index, row).props))).join("");
  assert.equal((html.match(/data-removal-field="time"/g) || []).length, 40);
  assert.equal((html.match(/<button/g) || []).length, 40);
  assert.equal((html.match(/<select/g) || []).length, 40);
  assert.equal((html.match(/<option value="west">West<\/option>/g) || []).length, 40);
  assert.equal((html.match(/<option value="east">East<\/option>/g) || []).length, 40);
  assert.doesNotMatch(html, /mainline|Off.Peak|readonly|value="00:00"/i);
  assert.match(html, /HDW row 40 removal depot/);
});

test("the refresh button fills only its own row with the current time, and does not change the depot", () => {
  const state = harness(17, { timing: "12:00", hdwDepot: "east" });
  const refresh = state.nodes.find((node) => node.type === "button");
  refresh.props.onClick();
  assert.deepEqual(state.changes, [["west", 17, "timing", "16:27"]]);
  assert.deepEqual(state.events, ["start", "end"]);
  assert.equal(state.props.row.hdwDepot, "east");
});

test("the depot menu offers only West and East without assigning unselected rows", () => {
  for (const hdwDepot of ["", "west", "east"]) {
    const state = harness(0, { timing: "", hdwDepot });
    const select = state.nodes.find((node) => node.type === "select");
    const options = state.nodes.filter((node) => node.type === "option");
    const choices = options.filter((node) => !node.props.hidden && !node.props.disabled);
    assert.deepEqual(choices.map((node) => [node.props.value, node.props.children]), [["west", "West"], ["east", "East"]]);
    assert.equal(select.props.value, hdwDepot);
    assert.deepEqual(state.changes, []);
    assert.ok(!options.some((node) => node.props.children === "Depot"));
    const unassigned = options.find((node) => node.props.value === "");
    assert.equal(unassigned.props.hidden, true);
    assert.equal(unassigned.props.disabled, true);
  }
});

test("manual time remains editable after refresh and uses the normal time-cleaning behavior", () => {
  const state = harness(5);
  const time = state.nodes.find((node) => node.type === "input");
  state.nodes.find((node) => node.type === "button").props.onClick();
  time.props.onChange({ target: { value: "2301" } });
  time.props.onBlur({ target: { value: "23:01" } });
  assert.deepEqual(state.changes, [["west", 5, "timing", "16:27"], ["west", 5, "timing", "23:01"], ["west", 5, "timing", "23:01"]]);
});

test("choosing East or West updates the selected row without touching its time or train number", () => {
  const state = harness(39, { trainId: "47", timing: "00:05", hdwDepot: "" });
  const depot = state.nodes.find((node) => node.type === "select");
  depot.props.onChange({ target: { value: "east" } });
  depot.props.onChange({ target: { value: "west" } });
  assert.deepEqual(state.changes, [["west", 39, "hdwDepot", "east"], ["west", 39, "hdwDepot", "west"]]);
  assert.equal(state.props.row.trainId, "47");
  assert.equal(state.props.row.timing, "00:05");
});

test("selected depots display compact WD and ED badges with distinct blue and red colors", () => {
  for (const [hdwDepot, label] of [["west", "WD"], ["east", "ED"], ["", "—"]]) {
    const state = harness(0, { timing: "", hdwDepot });
    const badge = state.nodes.find((node) => node.props.className === "theme-hdw-depot-badge");
    const control = state.nodes.find((node) => node.props.className === "theme-hdw-depot-control");
    assert.equal(badge.props.children, label);
    assert.equal(control.props["data-depot"], hdwDepot || "unassigned");
    assert.equal(state.nodes.find((node) => node.type === "select").props["aria-label"], "HDW row 1 removal depot");
  }
  const css = readFileSync(new URL("../src/trainRemHdw40.css", import.meta.url), "utf8");
  assert.match(css, /\.theme-hdw-depot-control\[data-depot="west"\] \{ color: #38bdf8; \}/);
  assert.match(css, /\.theme-hdw-depot-control\[data-depot="east"\] \{ color: #fb7185; \}/);
});

test("HDW starts at 40 running in ML and subtracts only complete train removals to West or East", () => {
  assert.equal(getHdwRunningInMlCount(), 40);
  assert.equal(getHdwRunningInMlCount(normalizeHdw40Rows()), 40);
  const rows = [
    { trainId: "35", timing: "12:00", hdwDepot: "west" },
    { trainId: "37", timing: "00:00", hdwDepot: "east" },
    { trainId: "24", timing: "", hdwDepot: "east" },
    { trainId: "01", timing: "12:15", hdwDepot: "" },
    { trainId: "", timing: "12:15", hdwDepot: "west" },
  ];
  assert.equal(getHdwRunningInMlCount(rows), 38);
  rows[2].timing = "12:20";
  assert.equal(getHdwRunningInMlCount(rows), 37);
  rows[0].timing = "";
  assert.equal(getHdwRunningInMlCount(rows), 38);
  rows[1].hdwDepot = "west";
  assert.equal(getHdwRunningInMlCount(rows), 38, "changing the destination does not subtract twice");
});

test("running in ML ignores duplicate trains, invalid times and invalid train IDs", () => {
  const rows = [
    { trainId: "1", timing: "12:00", hdwDepot: "west" },
    { trainId: "01", timing: "12:01", hdwDepot: "east" },
    { trainId: "T01", timing: "12:02", hdwDepot: "east" },
    { trainId: "02", timing: "24:00", hdwDepot: "west" },
    { trainId: "03", timing: "12:60", hdwDepot: "west" },
    { trainId: "04", timing: "12:", hdwDepot: "west" },
    { trainId: "48", timing: "12:00", hdwDepot: "west" },
    { trainId: "00", timing: "12:00", hdwDepot: "east" },
    { trainId: "05", timing: "12:00", hdwDepot: "mainline" },
    null,
  ];
  assert.equal(getHdwRunningInMlCount(rows), 39);
  assert.equal(getHdwRunningInMlCount(null), 40);
  const complete = Array.from({ length: 47 }, (_, i) => ({ trainId: String(i + 1), timing: "23:59", hdwDepot: i % 2 ? "west" : "east" }));
  assert.equal(getHdwRunningInMlCount(complete), 0, "retained legacy rows cannot produce a negative total");
});

test("HDW toolbar uses the live running-in-ML count instead of the old instruction text", () => {
  assert.match(source, /Total \{getHdwRunningInMlCount\(rows\)\} running in ML/);
  assert.doesNotMatch(source, /train rows · manual time · choose depot/);
});

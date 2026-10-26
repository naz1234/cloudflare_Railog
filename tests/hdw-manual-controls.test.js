import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RefreshCw } from "lucide-react";
import ts from "typescript";
import { normalizeHdw40Rows } from "../src/lib/trainRemHdw40.js";

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

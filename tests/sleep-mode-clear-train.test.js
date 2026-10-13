import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as icons from "lucide-react";
import {
  buildSleepModeGroupedText,
  clearSleepModeTrainLogs,
  formatSleepTimeInput,
  normalizeSleepLogTime,
  normalizeSleepModeLogs,
  normalizeSleepTrainId,
} from "../src/lib/sleepModeLog.js";

const source = readFileSync(new URL("../src/components/SleepModeWorkspace.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/sleepLogSlate.css", import.meta.url), "utf8");
const samples = () => normalizeSleepModeLogs([
  { id: "west-group", time: "19:20", trainIds: ["14", "26", "30"], location: "WD-ST15", mode: "sleep", remark: "Checked by DC", createdAt: "2026-10-14T19:20:00Z" },
  { id: "west-single", time: "20:00", trainIds: ["14"], location: "WD-ST14", mode: "wake", createdAt: "2026-10-14T20:00:00Z" },
  { id: "east-group", time: "20:30", trainIds: ["14", "18"], location: "ED-ST02", mode: "sleep", createdAt: "2026-10-14T20:30:00Z" },
  { id: "east-other", time: "21:00", trainIds: ["18"], location: "ED-ST02", mode: "wake", createdAt: "2026-10-14T21:00:00Z" },
]);

test("clearing a train removes its full mode history while retaining grouped companions in both depots", () => {
  const logs = samples();
  const original = structuredClone(logs);
  const remaining = clearSleepModeTrainLogs(logs, "T14");
  assert.deepEqual(logs, original, "input records must not be mutated");
  assert.deepEqual(remaining.map((entry) => entry.id), ["west-group", "east-group", "east-other"]);
  assert.ok(remaining.every((entry) => !entry.trainIds.includes("14")));
  assert.deepEqual(remaining[0].trainIds, ["26", "30"]);
  assert.equal(remaining[0].text, "19:20 hrs – T26 and T30 confirmed successfully in sleep mode at WD–ST15. – Checked by DC");
  assert.deepEqual(remaining[1].trainIds, ["18"]);
  assert.equal(remaining[1].text, "20:30 hrs – T18 confirmed successfully in sleep mode at ED–ST02.");
  for (const key of ["time", "location", "mode", "remark", "createdAt"]) assert.equal(remaining[0][key], logs[0][key]);
  assert.deepEqual(remaining[2], logs[3]);
  assert.doesNotMatch(buildSleepModeGroupedText(remaining), /T14/);
  assert.match(buildSleepModeGroupedText(remaining), /T26 and T30/);
});

test("clearing the last train drops empty rows and headings; invalid or absent targets leave logs alone", () => {
  const logs = samples();
  assert.deepEqual(clearSleepModeTrainLogs(logs, ""), logs);
  assert.deepEqual(clearSleepModeTrainLogs(logs, "missing"), logs);
  assert.deepEqual(clearSleepModeTrainLogs(logs, "47"), logs);
  assert.deepEqual(clearSleepModeTrainLogs([logs[1]], "14"), []);
  assert.equal(buildSleepModeGroupedText(clearSleepModeTrainLogs([logs[1]], "14")), "");
  assert.deepEqual(clearSleepModeTrainLogs([], "14"), []);
});

const layoutSource = source.slice(source.indexOf("const DEPOT_LAYOUTS"), source.indexOf("function getCurrentTime"));
const panelSource = source.slice(source.indexOf("function getCellKey"), source.indexOf("function SleepLogGroup"));
const compiled = ts.transpileModule(`${layoutSource}\n${panelSource}`, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const panelDependencies = { React, useMemo: (callback) => callback(), normalizeSleepTrainId, normalizeSleepLogTime, formatSleepTimeInput, ...icons };
const DepotSleepPanel = new Function(...Object.keys(panelDependencies), `${compiled}\nreturn DepotSleepPanel;`)(...Object.values(panelDependencies));

test("both depot cards expose a separate clear button for logged trains, never for Ready or empty cells", () => {
  for (const [depot, road] of [["west", "WD-ST15"], ["east", "ED-ST02"]]) {
    const props = {
      depot, data: { [road]: [{ trainId: "14" }, { trainId: "26" }, { trainId: "30" }] },
      selectedKeys: new Set([`${depot}:${road}:0:14`]),
      latestModeByTrain: new Map([["14", "sleep"], ["26", "wake"]]),
      logDraft: {}, loaded: true, saving: false,
    };
    const html = renderToStaticMarkup(React.createElement(DepotSleepPanel, props));
    assert.equal((html.match(/class="slp-stabling-train-clear"/g) || []).length, 2);
    assert.match(html, /aria-label="Clear Sleep\/Wake-up logs for T14"/);
    assert.match(html, /aria-label="Clear Sleep\/Wake-up logs for T26"/);
    assert.doesNotMatch(html, /aria-label="Clear Sleep\/Wake-up logs for T30"/);
    assert.match(html, /<\/button><button type="button" class="slp-stabling-train-clear"/);
    assert.match(html, /aria-pressed="true" aria-label="Deselect T14/);
    for (const state of [{ saving: true }, { loaded: false }]) {
      const disabled = renderToStaticMarkup(React.createElement(DepotSleepPanel, { ...props, ...state }));
      assert.equal((disabled.match(/disabled="" class="slp-stabling-train-clear"/g) || []).length, 2);
    }
  }
  assert.equal((source.match(/onClearTrain=\{setTrainToClear\}/g) || []).length, 2);
  assert.match(source, /<AlertDialog open=\{Boolean\(trainToClear\)\}/);
  assert.match(source, /<AlertDialogCancel>Cancel<\/AlertDialogCancel>/);
  assert.match(source, /onClick=\{\(\) => clearTrainLogs\(trainToClear\)\}/);
  assert.doesNotMatch(source, /window\.confirm/);
  assert.match(css, /\.slp-stabling-train-clear:focus-visible/);
  assert.match(css, /html\[data-app-theme="dark"\] \.slp-stabling-train-clear/);
});

function handlerHarness({ loaded = true, saving = false, pending = 0, trainToClear = "14" } = {}) {
  const logs = samples();
  const saves = [];
  const pendingSavesRef = { current: pending };
  let selection = ["west:WD-ST15:0:14", "west:WD-ST15:1:26", "east:ED-ST02:0:18"];
  const expression = source.slice(source.indexOf("const clearTrainLogs = useCallback"), source.indexOf("const copyLogs = useCallback"));
  const dependencies = {
    useCallback: (callback) => callback, normalizeSleepTrainId, loaded, saving, pendingSavesRef,
    latestModeByTrain: new Map([["14", "sleep"], ["18", "wake"]]), logs, clearSleepModeTrainLogs,
    persistLogs: (next) => { saves.push(next); pendingSavesRef.current += 1; },
    setSelectedKeyList: (update) => { selection = update(selection); },
    setConfirmClearDepot: () => {}, trainToClear, setTrainToClear: () => {},
  };
  const clear = new Function(...Object.keys(dependencies), `${expression}\nreturn clearTrainLogs;`)(...Object.values(dependencies));
  return { clear, saves, get selection() { return selection; } };
}

test("the clear icon requests confirmation for its own train without toggling selection or changing stabling", () => {
  function findElement(node, label) {
    if (!node || typeof node !== "object") return undefined;
    if (node.props?.["aria-label"] === label) return node;
    for (const child of React.Children.toArray(node.props?.children)) {
      const match = findElement(child, label);
      if (match) return match;
    }
    return undefined;
  }
  for (const [depot, road] of [["west", "WD-ST15"], ["east", "ED-ST02"]]) {
    const data = { [road]: [{ trainId: "14" }, { trainId: "26" }] };
    const original = structuredClone(data);
    const confirmations = [];
    const selections = [];
    const tree = DepotSleepPanel({
      depot, data, selectedKeys: new Set(), latestModeByTrain: new Map([["14", "sleep"]]),
      logDraft: {}, loaded: true, saving: false,
      onClearTrain: (id) => confirmations.push(id), onToggle: (key) => selections.push(key),
    });
    findElement(tree, "Clear Sleep/Wake-up logs for T14").props.onClick();
    assert.deepEqual(confirmations, ["14"]);
    assert.deepEqual(selections, []);
    assert.deepEqual(data, original);
  }
});

test("single-train clear confirms the exact train, persists through the shared save path and preserves other selections", () => {
  const harness = handlerHarness();
  harness.clear("14");
  assert.deepEqual(harness.saves[0], clearSleepModeTrainLogs(samples(), "14"));
  assert.deepEqual(harness.selection, ["west:WD-ST15:1:26", "east:ED-ST02:0:18"]);
  harness.clear("18");
  assert.equal(harness.saves.length, 1, "a second clear must wait for the pending save");
});

test("cancel, loading, saves in flight and Ready trains do not clear anything", () => {
  for (const options of [{ trainToClear: "" }, { trainToClear: "18" }, { loaded: false }, { saving: true }, { pending: 1 }]) {
    const harness = handlerHarness(options);
    harness.clear("14");
    assert.equal(harness.saves.length, 0);
    assert.ok(harness.selection.includes("west:WD-ST15:0:14"));
  }
  const harness = handlerHarness();
  harness.clear("47");
  harness.clear("");
  assert.equal(harness.saves.length, 0);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import manualArrivalTimePlugin from "../build/manualArrivalTimePlugin.js";

const source = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const functionSource = (name) => {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} must exist`);
  return source.slice(start, source.indexOf("\n}", start) + 2);
};
const context = vm.createContext({});
vm.runInContext(["parseHHMM", "addMinutesToHHMM", "isCompleteMovementTimeInput", "applyTp1MovementFieldChange"].map(functionSource).join("\n"), context);
const update = (form, field, value, mode = "automatic") => context.applyTp1MovementFieldChange(form, mode, field, value);

test("Automatic TR Localized defaults to ten minutes after TP1 arrival", () => {
  assert.equal(update({ trAtTp1: "", trLocalized: "" }, "trAtTp1", "17:08").trLocalized, "17:18");
  assert.equal(update({ trAtTp1: "", trLocalized: "" }, "trAtTp1", "00:00").trLocalized, "00:10");
  assert.equal(update({ trAtTp1: "", trLocalized: "" }, "trAtTp1", "23:55").trLocalized, "00:05");
});

test("a suggested localization follows arrival edits without adding ten minutes twice", () => {
  let form = update({ trAtTp1: "", trLocalized: "" }, "trAtTp1", "17:08");
  form = update(form, "trAtTp1", "17:20");
  assert.equal(form.trLocalized, "17:30");
  form = update(form, "trAtTp1", "17:20");
  assert.equal(form.trLocalized, "17:30");
});

test("incomplete or invalid arrivals do not generate a localization time", () => {
  for (const time of ["", "1", "17:", "17:2", "24:00", "17:60", "bad"]) {
    assert.equal(update({ trAtTp1: "", trLocalized: "" }, "trAtTp1", time).trLocalized, "", time);
  }
  let form = update({ trAtTp1: "", trLocalized: "" }, "trAtTp1", "17:08");
  form = update(form, "trAtTp1", "17:");
  assert.equal(form.trLocalized, "");
  form = update(form, "trAtTp1", "17:09");
  assert.equal(form.trLocalized, "17:19");
  assert.equal(update(form, "trAtTp1", "").trLocalized, "");
});

test("users can edit localization and all other timing fields without overwriting them", () => {
  const original = { trAtTp1: "17:08", trLocalized: "17:18", pstPerformedTime: "17:40" };
  let form = update(original, "trLocalized", "17:25");
  assert.equal(form.trLocalized, "17:25");
  form = update(form, "trAtTp1", "17:10");
  assert.equal(form.trLocalized, "17:25");
  form = update(form, "pstPerformedTime", "17:45");
  assert.equal(form.pstPerformedTime, "17:45");
  assert.equal(form.trAtTp1, "17:10");
  assert.equal(form.trLocalized, "17:25");
  assert.equal(original.trLocalized, "17:18");
  assert.equal(original.pstPerformedTime, "17:40");
});

test("custom Manual Area timings and saved localization values are not auto-adjusted", () => {
  const manual = update({ trAtTp1: "17:00", trLocalized: "", toManual: "17:15" }, "trAtTp1", "17:08", "manual");
  assert.equal(manual.trLocalized, "");
  assert.equal(manual.toManual, "17:15");
  assert.equal(manual.movementType, "manual");
  assert.equal(update({ trAtTp1: "17:00", trLocalized: "17:17" }, "trAtTp1", "17:08").trLocalized, "17:17");
});

test("the mode-scoped state setter applies the default without making the timing input read-only", () => {
  const setter = source.slice(source.indexOf("  const updateTp1ModeForm ="), source.indexOf("  const getMovementFlowInputKey ="));
  assert.match(setter, /\[normalizedMode\]: applyTp1MovementFieldChange\(currentModeForm, normalizedMode, field, value\)/);
  const step = source.slice(source.indexOf('        key: "trLocalized"'), source.indexOf('        key: "automaticStablingRoad"', source.indexOf('        key: "trLocalized"')));
  assert.match(step, /renderTp1TimeInput\("trLocalized"\)/);
  assert.doesNotMatch(step, /readOnly|disabled|renderTp1TimeInput\("trLocalized", true\)/);
  assert.match(source, /const helpId = isAutomatic && field === "trLocalized"\s*\? "tp1-automatic-localized-help"/);
  assert.match(source, /aria-describedby=\{helpId\}/);
  assert.match(source, /id=\{helpId\}[\s\S]*?Auto-adds 10 min after arrival at TP1\. You can edit any timing\./);
  assert.match(source, /const trLocalized = form\.trLocalized \|\| \(preview && trAtTp1 \? addMinutesToHHMM\(trAtTp1, 10\) : ""\)/);
});

test("Manual Area arrival defaults to TP1 arrival plus ten minutes, including midnight", () => {
  for (const [arrival, expected] of [["17:21", "17:31"], ["00:00", "00:10"], ["23:55", "00:05"]]) {
    const form = update({ trAtTp1: "", toManual: "", trLocalized: "" }, "trAtTp1", arrival, "manual");
    assert.equal(form.toManual, expected);
    assert.equal(form.trLocalized, "");
  }
});

test("suggested Manual Area arrival follows TP1 edits but preserves a user's own timing", () => {
  let form = update({ trAtTp1: "", toManual: "" }, "trAtTp1", "17:21", "manual");
  form = update(form, "trAtTp1", "17:25", "manual");
  assert.equal(form.toManual, "17:35");
  form = update(form, "toManual", "17:40", "manual");
  form = update(form, "trAtTp1", "17:26", "manual");
  assert.equal(form.toManual, "17:40");
  form = update(form, "fromTp1", "17:37", "manual");
  assert.equal(form.fromTp1, "17:37");
  assert.equal(form.toManual, "17:40");
});

test("Manual Area arrival is not generated from an incomplete or invalid TP1 time", () => {
  for (const time of ["", "1", "17:", "17:2", "24:00", "17:60", "bad"]) {
    assert.equal(update({ trAtTp1: "", toManual: "" }, "trAtTp1", time, "manual").toManual, "", time);
  }
  let form = update({ trAtTp1: "", toManual: "" }, "trAtTp1", "17:21", "manual");
  form = update(form, "trAtTp1", "17:", "manual");
  assert.equal(form.toManual, "");
  form = update(form, "trAtTp1", "17:23", "manual");
  assert.equal(form.toManual, "17:33");
  assert.equal(update(form, "trAtTp1", "", "manual").toManual, "");
});

test("the production Manual Area input retains the editable ten-minute note after its flow transform", () => {
  const transformed = manualArrivalTimePlugin().transform(source, "/repo/src/pages/DepotStabling.jsx").code;
  const manualFlow = transformed.slice(transformed.indexOf("const manualFlowSteps = ["), transformed.indexOf("const allFlowSteps ="));
  assert.match(manualFlow, /key: "toManual",\s*label: "Time arrival to Manual Area",[\s\S]*?render: \(\) => renderTp1TimeInput\("toManual"\)/);
  assert.doesNotMatch(manualFlow, /key: "fromTp1"|renderTp1TimeInput\("toManual", true\)/);
  assert.match(transformed, /!isAutomatic && field === "toManual" \? "tp1-manual-arrival-help"/);
  assert.match(transformed, /aria-describedby=\{helpId\}/);
  assert.match(transformed, /Auto-adds 10 min after arrival at TP1\. You can edit any timing\./);
  assert.match(transformed, /const toManual = form\.toManual \|\| \(preview && trAtTp1 \? addMinutesToHHMM\(trAtTp1, 10\) : ""\)/);
});

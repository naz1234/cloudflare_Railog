import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildSleepModeLogLine,
  createSleepModeLogEntry,
  formatSleepTimeInput,
  formatSleepTrainList,
  normalizeSleepModeLogs,
  normalizeSleepTrainId,
} from "../src/lib/sleepModeLog.js";

test("Sleep Mode uses the requested grouped Sleep log sentence", () => {
  assert.equal(
    buildSleepModeLogLine({
      time: "00:21",
      trainIds: ["10", "13", "16", "20", "35", "38", "44"],
      location: "WD-ST14",
      mode: "sleep",
    }),
    "00:21 hrs – T10, T13, T16, T20, T35, T38 and T44 successfully in sleep mode at WD–ST14.",
  );
});

test("Sleep Mode uses the requested grouped Wake-up log sentence", () => {
  assert.equal(
    buildSleepModeLogLine({
      time: "00:21",
      trainIds: ["T10", "T13", "T16", "T20", "T35", "T38", "T44"],
      location: "wd-st14",
      mode: "wake",
    }),
    "00:21 hrs – T10, T13, T16, T20, T35, T38 and T44 successfully in wake–up mode at WD–ST14.",
  );
});

test("Sleep Mode adds an optional remark to the shared log line", () => {
  assert.equal(
    buildSleepModeLogLine({
      time: "00:21",
      trainIds: ["10"],
      location: "WD-ST14",
      mode: "sleep",
      remark: "Confirmed by DC",
    }),
    "00:21 hrs – T10 successfully in sleep mode at WD–ST14. Remark: Confirmed by DC.",
  );
});

test("Sleep Mode time entry formats four digits as a 24-hour time", () => {
  assert.equal(formatSleepTimeInput("0021"), "00:21");
  assert.equal(formatSleepTimeInput("18:45"), "18:45");
});

test("Sleep train IDs normalize and grouped lists remove duplicates", () => {
  assert.equal(normalizeSleepTrainId("TS02"), "02");
  assert.equal(normalizeSleepTrainId("2"), "02");
  assert.equal(formatSleepTrainList(["02", "T2", "15", "27", "31"]), "T02, T15, T27 and T31");
});

test("Sleep logs normalize persisted entries and reject incomplete rows", () => {
  const valid = createSleepModeLogEntry({
    time: "1:05",
    trainIds: ["2"],
    location: "ED-ST02",
    mode: "wake",
  }, { id: "entry-1", now: "2026-08-17T01:05:00.000Z" });

  const normalized = normalizeSleepModeLogs([valid, { id: "empty", time: "", trainIds: [], location: "" }]);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].text, "01:05 hrs – T02 successfully in wake–up mode at ED–ST02.");
});

test("SLP is wired as a public route with shared cloud storage", () => {
  const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const depotSource = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");
  const componentSource = readFileSync(new URL("../src/components/SleepModeWorkspace.jsx", import.meta.url), "utf8");
  const clientSource = readFileSync(new URL("../src/api/base44Client.js", import.meta.url), "utf8");
  const entityFunctionSource = readFileSync(new URL("../functions/api/entities/[[path]].js", import.meta.url), "utf8");

  assert.match(appSource, /path="\/sleep"/);
  assert.match(appSource, /path="\/slp"/);
  assert.doesNotMatch(depotSource, /PROTECTED_SHORTCUT_KEYS[^;]+"sleep"/);
  assert.match(depotSource, /code: "SLP"/);
  assert.match(depotSource, /<SleepModeWorkspace westData=\{westData\} eastData=\{eastData\}/);
  assert.match(componentSource, /Log Sleep/);
  assert.match(componentSource, /Log Wake-up/);
  assert.match(componentSource, /Remark optional/);
  assert.match(clientSource, /'SleepModeLog'/);
  assert.match(entityFunctionSource, /'SleepModeLog'/);
});

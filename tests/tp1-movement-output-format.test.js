import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { buildTp1ManualCmmsHandoverLine } from "../src/lib/tp1ManualHandover.js";
import manualArrivalTimePlugin from "../build/manualArrivalTimePlugin.js";
import manualUnplannedSrPlugin from "../build/manualUnplannedSrPlugin.js";
import automaticParkingPstPlugin from "../build/automaticParkingPstPlugin.js";
import automaticExcelCompletedByPlugin from "../build/automaticExcelCompletedByPlugin.js";
import automaticNextWashOperPlugin from "../build/automaticNextWashOperPlugin.js";
import manualNextWashMaintPlugin from "../build/manualNextWashMaintPlugin.js";

const source = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const production = [manualArrivalTimePlugin, manualUnplannedSrPlugin, automaticParkingPstPlugin,
  automaticExcelCompletedByPlugin, automaticNextWashOperPlugin, manualNextWashMaintPlugin]
  .reduce((code, plugin) => plugin().transform(code, "/repo/src/pages/DepotStabling.jsx").code, source);
const functionSource = (code, name) => {
  const start = code.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  return code.slice(start, code.indexOf("\n}", start) + 2);
};
const helperNames = ["excelTimeToMinutes", "normalizeTrainId", "padTrainId", "normalizeMovementTrain",
  "parseHHMM", "addMinutesToHHMM", "formatTp1NextWashForLog", "formatTp1RoadForLog", "formatTp1ShunterNameForLog",
  "normalizeTp1MaintReportConfirmer", "getTp1TimedLineMinutes", "sortTp1TimedLogLines", "sortTp1MovementTextLinesByTime", "getTp1EntrySortMinutes"];
function harness(form, code = production) {
  const context = vm.createContext({
    tp1Form: form,
    getTp1ModeForm: () => form,
    findTp1TrainStablingRoad: () => "",
    buildTp1ManualCmmsHandoverLine,
  });
  const builderStart = code.indexOf("  const getTp1NextWashLine =");
  const builderEnd = code.indexOf("  const addTp1MovementLog =", builderStart);
  const functions = helperNames.map((name) => functionSource(code, name));
  if (code === production) functions.push(functionSource(code, "subtractThreeMinutesFromHHMM"));
  vm.runInContext(`const TP1_MAINT_REPORT_CONFIRMERS = ["Siraj", "Rayan"];\n${functions.join("\n")}\n${code.slice(builderStart, builderEnd)}\nthis.buildOutput = buildTp1MovementText;`, context);
  return context;
}
const sample = {
  trainSet: "05", planStatus: "Unplanned", shunterName: "FAZREEN", trAtTp1: "12:23", trLocalized: "12:33",
  toManual: "12:33", nextWashText: "20-10-2026 09:15:00", cmmsNumber: "2232",
};
const header = (area = "Automatic", cmms = "2232") => [
  `T05 – Unplanned movement to ${area} Area.`,
  "Next wash: 20/10/2026 at 09:15 hrs.",
  `CMMS HO for handover: #${cmms}.`,
].join("\n");

for (const [environment, code] of [["local", source], ["production", production]]) {
  test(`${environment} Automatic output exactly matches the supplied format`, () => {
    const output = harness(sample, code).buildOutput({ movementType: "automatic" });
    assert.equal(output, [header(), "",
      "12:23 hrs – T05 arrived at TP1 with Shunter Fazreen onboard.",
      "12:24 hrs – T05 authorized to prepare the train, conduct a brake self-test, and localize the train.",
      "12:33 hrs – T05 localized at TP1.",
    ].join("\n"));
    assert.doesNotMatch(output, /Hand Back Completed|handover completed|──/);
    assert.equal(harness(sample, code).buildOutput({ preview: true, movementType: "automatic" }), output);
  });
}

test("Manual output has the same header block and separately timed arrival events", () => {
  const output = harness(sample).buildOutput({ movementType: "manual" });
  assert.equal(output, [header("Manual"), "",
    "12:23 hrs – T05 arrived at TP1 with Shunter Fazreen onboard.",
    "12:24 hrs – T05 was authorized to prepare the train.",
    "12:30 hrs – T05 departed from TP1.",
    "12:33 hrs – T05 arrived at the Manual Area.",
  ].join("\n"));
  assert.doesNotMatch(output, /CMMS handover completed|Hand Back Completed/);
});

test("Manual SR and selected maintenance-report notes survive the new formatting", () => {
  const output = harness({ ...sample, srNumber: "10121125", l3ReportUpdatedBy: "SIRAJ" }).buildOutput({ movementType: "manual" });
  assert.match(output, /CMMS HO for handover: #2232 with SR #10121125\.\n\n12:23 hrs/);
  assert.match(output, /12:33 hrs – As per Siraj, the L3 report has already been updated to maintenance, so no need to update the HO section\./);
  const planned = harness({ ...sample, planStatus: "Planned", srNumber: "10121125" }).buildOutput({ movementType: "manual" });
  assert.doesNotMatch(planned, /SR #/);
});

test("optional preparation and PST times stay sorted and manual timing overrides remain intact", () => {
  const context = harness({ ...sample, trainPrepCompletedTime: "12:50", pstPerformedTime: "12:40", trLocalized: "12:35", automaticStablingRoad: "WD-ST14" });
  const output = context.buildOutput({ movementType: "automatic" });
  assert.ok(output.indexOf("12:35 hrs") < output.indexOf("12:40 hrs"));
  assert.ok(output.indexOf("12:40 hrs") < output.indexOf("12:50 hrs"));
  assert.match(output, /12:40 hrs – T05 PST completed at WD–ST14 from 12:40 to 12:46 hrs/);
  assert.match(output, /12:50 hrs – T05 Train preparation completed at WD–ST14 by Shunter Fazreen/);
  const manual = harness({ ...sample, toManual: "12:40" }).buildOutput({ movementType: "manual" });
  assert.match(manual, /12:37 hrs – T05 departed from TP1/);
  assert.match(manual, /12:40 hrs – T05 arrived at the Manual Area/);
});

test("next-wash formats and omitted optional metadata do not create placeholder lines", () => {
  for (const text of ["20/10/2026 09:15", "2026-10-20T09:15:00"]) {
    assert.match(harness({ ...sample, nextWashText: text }).buildOutput({ movementType: "automatic" }), /Next wash: 20\/10\/2026 at 09:15 hrs\./);
  }
  assert.match(harness({ ...sample, nextWashText: "Awaiting confirmation" }).buildOutput({ movementType: "automatic" }), /Next wash: Awaiting confirmation\./);
  const partial = harness({ trainSet: "05", planStatus: "Planned" }).buildOutput({ movementType: "automatic" });
  assert.equal(partial, "T05 – Planned movement to Automatic Area.");
  const partialManual = harness({ trainSet: "05", planStatus: "Planned" }).buildOutput({ movementType: "manual" });
  assert.equal(partialManual, "T05 – Planned movement to Manual Area.");
});

test("copy/display sorting keeps one blank separator and never uses next-wash time to sort movements", () => {
  const context = harness(sample);
  const unsorted = [header(), "", "12:33 hrs – Localized.", "12:23 hrs – Arrived.", "12:24 hrs – Authorized."].join("\n");
  const sorted = context.sortTp1MovementTextLinesByTime(unsorted);
  assert.equal(sorted, [header(), "", "12:23 hrs – Arrived.", "12:24 hrs – Authorized.", "12:33 hrs – Localized."].join("\n"));
  assert.equal(context.sortTp1MovementTextLinesByTime(sorted), sorted);
  assert.equal(context.getTp1EntrySortMinutes({ text: sorted }), 12 * 60 + 23);
  assert.equal(context.getTp1EntrySortMinutes({ text: header() }), 99999);
  assert.equal(context.getTp1EntrySortMinutes({ trAtTp1: "11:00", text: sorted }), 11 * 60);
});

test("preview, saved entries and copy routes all use the same movement formatter", () => {
  assert.match(source, /const text = buildTp1MovementText\(\{ movementType \}\)/);
  assert.match(source, /await copyTextToClipboard\(buildTp1MovementText\(\{ preview: true, movementType \}\)\)/);
  assert.match(source, /\{buildTp1MovementText\(\{ preview: true, movementType \}\)\}/);
  assert.match(source, /sortTp1MovementEntries\(entriesToCopy\)\.map\(\(entry\) => sortTp1MovementTextLinesByTime\(entry\.text\)\)/);
});

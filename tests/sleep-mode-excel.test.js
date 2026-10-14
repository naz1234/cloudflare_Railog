import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import {
  buildSleepModeExcelFileName,
  createSleepModeExcelBytes,
  getSleepExcelShift,
  summarizeSleepLogsForExcel,
} from "../src/lib/sleepModeExcel.js";

const repeatedLogs = [
  { id: "sleep-2", time: "00:20", trainIds: ["10"], location: "WD-ST14", mode: "sleep", remark: "Second sleep", createdAt: "2026-08-17T00:20:00.000Z" },
  { id: "wake-1", time: "00:30", trainIds: ["10"], location: "WD-ST14", mode: "wake", remark: "First wake", createdAt: "2026-08-17T00:30:00.000Z" },
  { id: "sleep-1", time: "00:10", trainIds: ["10"], location: "WD-ST14", mode: "sleep", remark: "First sleep", createdAt: "2026-08-17T00:10:00.000Z" },
  { id: "wake-2", time: "00:45", trainIds: ["10"], location: "WD-ST14", mode: "wake", remark: "Last wake", createdAt: "2026-08-17T00:45:00.000Z" },
];

test("SLP Excel assigns Night, Early, and Late shifts at the correct boundaries", () => {
  assert.equal(getSleepExcelShift("23:00"), "night");
  assert.equal(getSleepExcelShift("06:59"), "night");
  assert.equal(getSleepExcelShift("07:00"), "early");
  assert.equal(getSleepExcelShift("14:59"), "early");
  assert.equal(getSleepExcelShift("15:00"), "late");
  assert.equal(getSleepExcelShift("22:59"), "late");
});

test("SLP Excel uses the first Sleep and last Wake-up when a train is logged more than once", () => {
  const summary = summarizeSleepLogsForExcel(repeatedLogs);
  assert.deepEqual(summary, [{
    shift: "night",
    trainId: "10",
    date: "17-Aug-2026",
    location: "Stabling 14",
    sleepTime: "00:10 hrs",
    wakeTime: "00:45 hrs",
    remark: "First sleep / Last wake",
  }]);
});

test("SLP Excel workbook follows the supplied three-shift template", () => {
  const bytes = createSleepModeExcelBytes(repeatedLogs);
  const reopened = XLSX.read(bytes, { type: "array", cellStyles: true, cellDates: false });
  const sheet = reopened.Sheets["Sleep & Stdby Mode"];
  assert.equal(sheet.A2.v, "NIGHT SHIFT (Sleep Mode)");
  assert.equal(sheet.G2.v, "Early Shift (Sleep Mode)");
  assert.equal(sheet.M2.v, "LATE Shift (Sleep Mode)");
  assert.equal(sheet.A13.v, "T10");
  assert.equal(sheet.B13.v, "17-Aug-2026");
  assert.equal(sheet.C13.v, "Stabling 14");
  assert.equal(sheet.D13.v, "00:10 hrs");
  assert.equal(sheet.E13.v, "00:45 hrs");
  assert.equal(sheet.F13.v, "First sleep / Last wake");
  assert.equal(sheet["!ref"], "A2:R50");
  assert.equal(sheet["!merges"].length, 3);
  assert.equal(sheet.A2.s.fgColor.rgb, "ED7D31");
});

test("both depot exports include location in Early and Late shifts without shifting timings or remarks", () => {
  for (const location of ["WD-ST14", "ED-ST02"]) {
    const logs = [
      ...repeatedLogs.map((entry) => ({ ...entry, location })),
      { id: "early-sleep", time: "08:10", trainIds: ["10"], location, mode: "sleep", remark: "Early checked", createdAt: "2026-08-17T08:10:00.000Z" },
      { id: "early-wake", time: "09:25", trainIds: ["10"], location, mode: "wake", remark: "Early ready", createdAt: "2026-08-17T09:25:00.000Z" },
      { id: "late-wake-only", time: "16:20", trainIds: ["47"], location, mode: "wake", remark: "Late ready", createdAt: "2026-08-17T16:20:00.000Z" },
    ];
    const sheet = XLSX.read(createSleepModeExcelBytes(logs), { type: "array", cellStyles: true }).Sheets["Sleep & Stdby Mode"];
    const expectedLocation = location === "WD-ST14" ? "Stabling 14" : "Stabling 02";
    assert.equal(sheet.C13.v, expectedLocation, "Night location stays in its original column");
    assert.equal(sheet.D13.v, "00:10 hrs");
    assert.equal(sheet.E13.v, "00:45 hrs");
    assert.equal(sheet.I3.v, "Location");
    assert.equal(sheet.O3.v, "Location");
    assert.deepEqual([sheet.G13.v, sheet.H13.v, sheet.I13.v, sheet.J13.v, sheet.K13.v, sheet.L13.v],
      ["T10", "17-Aug-2026", expectedLocation, "08:10 hrs", "09:25 hrs", "Early checked / Early ready"]);
    assert.deepEqual([sheet.M50.v, sheet.N50.v, sheet.O50.v, sheet.P50.v, sheet.Q50.v, sheet.R50.v],
      ["T47", "17-Aug-2026", expectedLocation, "", "16:20 hrs", "Late ready"]);
    assert.equal(sheet.I14.v, "", "unlogged trains have no invented location");
    assert.equal(sheet.O14.v, "");
    assert.deepEqual(sheet["!merges"].map((range) => XLSX.utils.encode_range(range)), ["A2:F2", "G2:L2", "M2:R2"]);
    assert.equal(sheet.G2.s.fgColor.rgb, "FFFF00");
    assert.equal(sheet.I3.s.fgColor.rgb, "FFFF00");
    assert.equal(sheet.M2.s.fgColor.rgb, "4472C4");
    assert.equal(sheet.O3.s.fgColor.rgb, "4472C4");
  }
});

test("SLP Excel filename uses the latest saved log date", () => {
  assert.equal(buildSleepModeExcelFileName(repeatedLogs), "SLP-Sleep-Mode-2026-08-17.xlsx");
  assert.equal(buildSleepModeExcelFileName(repeatedLogs, undefined, "WD"), "SLP-WD-Sleep-Mode-2026-08-17.xlsx");
  assert.equal(buildSleepModeExcelFileName(repeatedLogs, undefined, "East Depot"), "SLP-EAST-DEPOT-Sleep-Mode-2026-08-17.xlsx");
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildTcRemovalPdfLog,
  getTcActiveTimetableRemovalTime,
} from "../src/lib/tcRemovalPdf.js";

const activeTimetable = {
  parsedData: {
    removal: {
      west: {
        entries: [
          { tid: "212", time: "09:03" },
          { tid: "214", time: "09:09" },
        ],
        presets: {
          "9am": {
            entries: [
              { tid: "212", time: "09:03" },
              { tid: "214", time: "09:09" },
            ],
            timeMap: { 212: "09:03", 214: "09:09" },
          },
        },
      },
      east: {
        entries: [{ tid: "112", time: "09:05" }],
        presets: {
          "9am": {
            entries: [{ tid: "112", time: "09:05" }],
            timeMap: { 112: "09:05" },
          },
        },
      },
    },
  },
};

test("TC removal time comes from the matching active timetable depot", () => {
  assert.equal(getTcActiveTimetableRemovalTime(activeTimetable, "west", "9am", "212"), "09:03");
  assert.equal(getTcActiveTimetableRemovalTime(activeTimetable, "east", "9am", "112"), "09:05");
  assert.equal(getTcActiveTimetableRemovalTime(activeTimetable, "east", "9am", "212"), "");
});

test("TC log replaces Removal Summary timing instead of falling back to it", () => {
  const result = buildTcRemovalPdfLog({
    entries: [
      { trainId: "18", tid: "212", time: "10:44", remark: "Wash" },
      { trainId: "04", tid: "214", time: "10:45", remark: "PM" },
    ],
  }, activeTimetable, "west", "9am");

  assert.deepEqual(result.entries.map((entry) => entry.time), ["09:03", "09:09"]);
  assert.deepEqual(result.entries.map((entry) => entry.remark), ["Wash", "PM"]);
});

test("TC log leaves time blank when the TID is not in the active timetable", () => {
  const result = buildTcRemovalPdfLog({
    entries: [{ trainId: "18", tid: "999", time: "10:44" }],
  }, activeTimetable, "west", "9am");

  assert.equal(result.entries[0].time, "");
});

test("TC log is sorted by active timetable timing with unmatched trains last", () => {
  const result = buildTcRemovalPdfLog({
    entries: [
      { trainId: "99", tid: "999", time: "08:00" },
      { trainId: "04", tid: "214", time: "08:01" },
      { trainId: "18", tid: "212", time: "08:02" },
    ],
  }, activeTimetable, "west", "9am");

  assert.deepEqual(result.entries.map((entry) => entry.trainId), ["18", "04", "99"]);
});

test("PDF toolbar exposes DC and TC choices and TC uses removal-only layout", () => {
  const source = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");
  assert.match(source, />DC PDF</);
  assert.match(source, />TC PDF</);
  assert.match(source, /layout:\s*"tcRemovalOnly"/);
  assert.match(source, /buildTcRemovalPdfLog\(/);
});

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
          { tid: "212", time: "09:08", timetableTime: "09:03" },
          { tid: "214", time: "09:14", timetableTime: "09:09" },
        ],
        presets: {
          "9am": {
            entries: [
              { tid: "212", time: "09:08", timetableTime: "09:03" },
              { tid: "214", time: "09:14", timetableTime: "09:09" },
            ],
            timeMap: { 212: "09:08", 214: "09:14" },
          },
        },
      },
      east: {
        entries: [{ tid: "112", time: "09:10", timetableTime: "09:05" }],
        presets: {
          "9am": {
            entries: [{ tid: "112", time: "09:10", timetableTime: "09:05" }],
            timeMap: { 112: "09:10" },
          },
        },
      },
    },
  },
};

test("TC removal time comes from the raw active timetable value", () => {
  assert.equal(getTcActiveTimetableRemovalTime(activeTimetable, "west", "9am", "212"), "09:03");
  assert.equal(getTcActiveTimetableRemovalTime(activeTimetable, "east", "9am", "112"), "09:05");
  assert.equal(getTcActiveTimetableRemovalTime(activeTimetable, "east", "9am", "212"), "");
});

test("TC ignores the depot-arrival offset stored for Removal Summary", () => {
  assert.equal(activeTimetable.parsedData.removal.west.presets["9am"].timeMap[212], "09:08");
  assert.equal(getTcActiveTimetableRemovalTime(activeTimetable, "west", "9am", "212"), "09:03");
});

test("TC 12am output keeps West TID 122 and 123 at their raw timetable times", () => {
  const twelveAmTimetable = {
    parsedData: {
      removal: {
        west: {
          presets: {
            "12am": {
              entries: [
                { tid: "122", time: "00:08", timetableTime: "00:03" },
                { tid: "123", time: "00:14", timetableTime: "00:09" },
              ],
              timeMap: { 122: "00:08", 123: "00:14" },
            },
          },
        },
      },
    },
  };

  const result = buildTcRemovalPdfLog({
    entries: [
      { trainId: "43", tid: "122", time: "00:08" },
      { trainId: "34", tid: "123", time: "00:14" },
    ],
  }, twelveAmTimetable, "west", "12am");

  assert.deepEqual(result.entries.map((entry) => entry.time), ["00:03", "00:09"]);
});

test("TC log replaces Removal Summary timing and clears all remarks", () => {
  const result = buildTcRemovalPdfLog({
    entries: [
      {
        trainId: "18",
        tid: "212",
        time: "10:44",
        remark: "Wash",
        remarkPills: [{ text: "Wash", fill: "#bbf7d0" }],
        remarkFill: "#bbf7d0",
      },
      {
        trainId: "04",
        tid: "214",
        time: "10:45",
        remark: "PM",
        remarkPills: [{ text: "PM", fill: "#f0abfc" }],
        remarkFill: "#f0abfc",
      },
    ],
  }, activeTimetable, "west", "9am");

  assert.deepEqual(result.entries.map((entry) => entry.time), ["09:03", "09:09"]);
  assert.deepEqual(result.entries.map((entry) => entry.remark), ["", ""]);
  assert.deepEqual(result.entries.map((entry) => entry.remarkPills), [[], []]);
  assert.deepEqual(result.entries.map((entry) => entry.remarkFill), ["", ""]);
});

test("TC log leaves time blank when the TID is not in the active timetable", () => {
  const result = buildTcRemovalPdfLog({
    entries: [{ trainId: "18", tid: "999", time: "10:44" }],
  }, activeTimetable, "west", "9am");

  assert.equal(result.entries[0].time, "");
});

test("TC log retains an extra removal train without a TID or timetable time", () => {
  const result = buildTcRemovalPdfLog({
    entries: [{ trainId: "12", tid: "", time: "" }],
  }, activeTimetable, "east", "12am");

  assert.deepEqual(result.entries, [{
    trainId: "12",
    tid: "",
    time: "",
    remark: "",
    remarkPills: [],
    remarkFill: "",
  }]);
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
  assert.match(source, /role="menuitem"\s+onClick=\{handleTrainRemSwpOpen\}[\s\S]*?>DC PDF</);
  assert.doesNotMatch(source, /handleTrainRemPdfDownload\(depot, event, "dc"\)/);
  assert.match(source, /layout:\s*"tcRemovalOnly"/);
  assert.match(source, /buildTcRemovalPdfLog\(/);
  assert.match(source, /isTcOutput \? \{ includeUntimedEntries: true \} : undefined/);
  assert.match(source, /!key \|\| \(!time && !includeUntimedEntries\)/);
  assert.match(source, /const TIMETABLE_PARSE_VERSION = 6;/);
  assert.match(source, /const timetableTime = formatSecondsAsTime\(excelTimeToSeconds\(row\[westArrivalIndex\]\)\)/);
  assert.match(source, /const timetableTime = formatSecondsAsTime\(excelTimeToSeconds\(row\[eastArrivalIndex\]\)\)/);
});

test("open PDF menu stays above Removal Summary row controls", () => {
  const source = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");
  assert.match(source, /pdfMenuOpen \? "z-\[120\]" : "z-30"/);
  assert.match(source, /className="absolute top-1\/2 z-\[60\]"/);
});

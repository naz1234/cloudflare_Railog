import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  addMinutesToPSTManualTime,
  buildPSTManualLogEntry,
  getPSTManualEntrySignature,
} from "../src/lib/pstManualEntry.js";

const depotStablingSource = readFileSync(
  new URL("../src/pages/DepotStabling.jsx", import.meta.url),
  "utf8",
);

const manualEntrySource = readFileSync(
  new URL("../src/components/depot/PSTManualEntry.jsx", import.meta.url),
  "utf8",
);

test("manual PST entries use the shared log structure and default six-minute duration", () => {
  const entry = buildPSTManualLogEntry({
    key: "manual-pst-test",
    type: "PST",
    depot: "west",
    trainId: "22",
    road: "WD-ST14",
    startTime: "03:20",
    alarmStatus: "no_alarm",
    createdAt: "2026-08-02T00:00:00.000Z",
  });

  assert.deepEqual(entry, {
    key: "manual-pst-test",
    text: "03:20 hrs \u2013 PST commenced at WD\u2013ST14 for T22. Completed at 03:26 hrs. No alarm reported.",
    type: "PST",
    depot: "west",
    road: "WD-ST14",
    trainKey: "T22",
    startTime: "03:20",
    endTime: "03:26",
    alarmStatus: "no_alarm",
    manualEntry: true,
    source: "manual",
    createdAt: "2026-08-02T00:00:00.000Z",
  });
});
test("manual PST duration handles midnight rollover", () => {
  assert.equal(addMinutesToPSTManualTime("23:58", 6), "00:04");
});

test("manual Train Prep entries support an optional TA name", () => {
  const entry = buildPSTManualLogEntry({
    key: "manual-prep-test",
    type: "Prep",
    depot: "east",
    trainId: "T7",
    road: "ED-ST03",
    endTime: "04:10",
    taName: "TA Leo",
    createdAt: "2026-08-02T00:00:00.000Z",
  });

  assert.equal(entry.trainKey, "T07");
  assert.equal(entry.text, "04:10 hrs \u2013 T07 Train preparation completed at ED\u2013ST03. Performed by TA Leo.");
  assert.equal(entry.type, "Prep");
  assert.equal(entry.manualEntry, true);
});

test("manual entry signatures detect duplicates regardless of train formatting", () => {
  assert.equal(
    getPSTManualEntrySignature({ type: "PST", depot: "west", trainId: "22", road: "WD-ST14", startTime: "3:20", endTime: "3:26" }),
    getPSTManualEntrySignature({ type: "PST", depot: "west", trainKey: "T22", road: "WD\u2013ST14", startTime: "03:20", endTime: "03:26" }),
  );
});

test("the manual-entry window is directly above and feeds the shared log output", () => {
  const manualPanelIndex = depotStablingSource.indexOf("<PSTManualEntry");
  const sharedOutputIndex = depotStablingSource.indexOf('<PSTLogOutput depot="west"', manualPanelIndex);

  assert.ok(manualPanelIndex >= 0, "expected the PST manual-entry panel");
  assert.ok(sharedOutputIndex > manualPanelIndex, "manual-entry panel must appear above the shared output");
  assert.match(depotStablingSource, /onAddManualLog=\{handleActiveAddManualPSTLog\}/);
  assert.match(depotStablingSource, /onRemoveManualLog=\{handleActiveRemoveManualPSTLog\}/);
  assert.match(depotStablingSource, /entry\?\.manualEntry &&[\s\S]*isPSTLogEntry\(entry\)[\s\S]*isTrainPrepLogEntry\(entry\)/);
  assert.match(manualEntrySource, /PST &amp; Train Prep Manual Entry/);
  assert.match(manualEntrySource, /Add manual single entries to the shared PST \/ Train Prep Log Output\./);
});

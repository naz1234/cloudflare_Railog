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

test("West and East use separate manual-entry windows above their shared outputs", () => {
  const westManualIndex = depotStablingSource.indexOf('<PSTManualEntry depot="west"');
  const westOutputIndex = depotStablingSource.indexOf('<PSTLogOutput depot="west"', westManualIndex);
  const eastManualIndex = depotStablingSource.indexOf('<PSTManualEntry depot="east"');
  const eastOutputIndex = depotStablingSource.indexOf('<PSTLogOutput depot="east"', eastManualIndex);

  assert.ok(westManualIndex >= 0, "expected the West Depot manual-entry panel");
  assert.ok(westOutputIndex > westManualIndex, "West manual entry must appear above the West output");
  assert.ok(eastManualIndex >= 0, "expected the East Depot manual-entry panel");
  assert.ok(eastOutputIndex > eastManualIndex, "East manual entry must appear above the East output");
  assert.match(depotStablingSource, /onAddManualLog=\{handleActiveAddManualPSTLog\}/);
  assert.match(depotStablingSource, /onRemoveManualLog=\{handleActiveRemoveManualPSTLog\}/);
  assert.match(depotStablingSource, /entry\?\.manualEntry &&[\s\S]*isPSTLogEntry\(entry\)[\s\S]*isTrainPrepLogEntry\(entry\)/);
  assert.match(manualEntrySource, /entry\?\.manualEntry && entry\?\.depot === normalizedDepot/);
  assert.match(manualEntrySource, /\{depotLabel\} — PST &amp; Train Prep Manual Entry/);
  assert.doesNotMatch(manualEntrySource, /aria-label="Manual entry depot"/);
  assert.doesNotMatch(manualEntrySource, /<th>Depot<\/th>/);
});

test("PST completion is calculated and read-only while Train Prep completion remains editable", () => {
  assert.match(manualEntrySource, /endTime: addMinutesToPSTManualTime\(startTime, 6\)/);
  assert.match(manualEntrySource, /isPST \? <span className="pst-manual-calculated-time"/);
  assert.match(manualEntrySource, /title="Calculated automatically at PST start time \+6 minutes"/);
  assert.match(manualEntrySource, /aria-label=\{`\$\{depotLabel\} Train Prep completion time`\}/);
  assert.doesNotMatch(manualEntrySource, /aria-label="Completion time"/);
});

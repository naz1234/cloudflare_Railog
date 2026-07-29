import test from "node:test";
import assert from "node:assert/strict";
import {
  countAssignedInsertionRows,
  isInsertionTidAssigned,
  summarizeInsertionTidUsage,
} from "../src/lib/insertionTidUsage.js";

test("normal scheduled TIDs count as assigned without a special remark", () => {
  const rows = [
    { tid: 127, remark: "", time: "16:34" },
    { tid: 128, time: "16:40" },
    { tid: 129, time: "16:46" },
  ];
  const usedTidKeys = new Set(["128"]);

  assert.equal(countAssignedInsertionRows(rows, usedTidKeys, true), 1);
  assert.equal(isInsertionTidAssigned(128, usedTidKeys, true), true);
});

test("duplicate stabling assignments keep one assigned row and flag the TID", () => {
  const usage = summarizeInsertionTidUsage([128, "TID 128", 129]);
  const rows = [{ tid: 128 }, { tid: 129 }, { tid: 130 }];
  const usedTidKeys = new Set(usage.usedTidKeys);

  assert.deepEqual(usage.usedTidKeys, ["128", "129"]);
  assert.deepEqual(usage.duplicateTidKeys, ["128"]);
  assert.equal(countAssignedInsertionRows(rows, usedTidKeys, true), 2);
});

test("assigned counting remains disabled outside the Weekday schedule", () => {
  const rows = [{ tid: 128 }];
  const usedTidKeys = new Set(["128"]);

  assert.equal(countAssignedInsertionRows(rows, usedTidKeys, false), 0);
  assert.equal(isInsertionTidAssigned(128, usedTidKeys, false), false);
});

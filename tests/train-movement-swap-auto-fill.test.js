import test from "node:test";
import assert from "node:assert/strict";
import {
  getSwappingAutoFillFields,
  getSwappingTidFromRemovalRows,
} from "../src/lib/trainMovementSwapAutoFill.js";

const nineAmRows = [
  { trainId: "25", tid: "111" },
  { trainId: "03", tid: "217" },
];

const sevenPmRows = [
  { trainId: "25", tid: "215" },
  { trainId: "3", tid: "101" },
];

test("swapping TID follows the currently supplied Removal Summary rows", () => {
  assert.equal(getSwappingTidFromRemovalRows(nineAmRows, "25"), "111");
  assert.equal(getSwappingTidFromRemovalRows(sevenPmRows, "25"), "215");
  assert.equal(getSwappingTidFromRemovalRows(sevenPmRows, "03"), "101");
});

test("swapping auto-fill waits for an exact two-digit train number", () => {
  assert.deepEqual(
    getSwappingAutoFillFields({ trainId: "2", removalRows: nineAmRows, reason: "RST PM" }),
    { trainKey: "", tid: "", reason: "" },
  );
});

test("swapping auto-fill combines the active TID with the Train Request reason", () => {
  assert.deepEqual(
    getSwappingAutoFillFields({ trainId: "25", removalRows: sevenPmRows, reason: "RST PM 09-AUG" }),
    { trainKey: "25", tid: "215", reason: "RST PM 09-AUG" },
  );
});

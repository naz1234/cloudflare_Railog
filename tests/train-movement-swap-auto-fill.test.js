import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getSwappingAutoFillFields,
  getSwappingTidFromRemovalRows,
} from "../src/lib/trainMovementSwapAutoFill.js";

const depotStablingSource = readFileSync(
  new URL("../src/pages/DepotStabling.jsx", import.meta.url),
  "utf8",
);

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

test("East Depot swapping can fall back to an off-peak reference TID", () => {
  const eastRemovalRows = [{ trainId: "11", tid: "112" }];
  const offPeakReferenceRows = [{ trainId: "03", tid: "101" }];

  assert.deepEqual(
    getSwappingAutoFillFields({
      trainId: "03",
      removalRows: eastRemovalRows,
      fallbackRemovalRows: offPeakReferenceRows,
      reason: "RST PM",
    }),
    { trainKey: "3", tid: "101", reason: "RST PM" },
  );
});

test("normal depot removal TID takes priority over an off-peak fallback", () => {
  assert.equal(
    getSwappingAutoFillFields({
      trainId: "03",
      removalRows: [{ trainId: "03", tid: "217" }],
      fallbackRemovalRows: [{ trainId: "03", tid: "101" }],
    }).tid,
    "217",
  );
});

test("the Swapping editor supplies active off-peak reference rows to auto-fill", () => {
  assert.match(
    depotStablingSource,
    /const fallbackRemovalRows = collectTrainRemReferenceInServiceRows\([\s\S]*?fallbackRemovalRows,/,
  );
});

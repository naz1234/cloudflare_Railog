import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  addOnBeforeRequestedSummaryTrailingDate,
  formatRequestedSummaryEntryCount,
  formatRequestedSummaryOtherAction,
  getRequestedSummaryWorkshopMovementDirection,
  normalizeRequestedSummaryDates,
  removeRequestedSummaryLeadingSeparator,
} from "../src/lib/requestedActionSummary.js";

const depotStablingSource = readFileSync(
  new URL("../src/pages/DepotStabling.jsx", import.meta.url),
  "utf8",
);

test("request summary dates use one readable format", () => {
  assert.equal(normalizeRequestedSummaryDates("01AUG"), "1 Aug");
  assert.equal(normalizeRequestedSummaryDates("1-AUG"), "1 Aug");
  assert.equal(normalizeRequestedSummaryDates("1-Aug"), "1 Aug");
  assert.equal(removeRequestedSummaryLeadingSeparator("- 01AUG"), "1 Aug");
  assert.equal(addOnBeforeRequestedSummaryTrailingDate("RST PM 1-AUG"), "RST PM on 1 Aug");
});

test("request summary actions use grammatical operational wording", () => {
  assert.equal(formatRequestedSummaryOtherAction("Always manNED"), "remain manned at all times");
  assert.equal(formatRequestedSummaryOtherAction("ATC TESTING"), "ATC testing");
  assert.equal(formatRequestedSummaryOtherAction("RESTRICTED"), "restricted operation");
  assert.equal(formatRequestedSummaryOtherAction("UNFIT / PARK MODE"), "unfit / park mode");
  assert.equal(formatRequestedSummaryOtherAction("ATC Inspection 1-Aug"), "ATC inspection on 1 Aug");
  assert.equal(formatRequestedSummaryOtherAction("APU Alarm"), "APU alarm");
});

test("request summary badges explain that they count entries", () => {
  assert.equal(formatRequestedSummaryEntryCount(1), "1 entry");
  assert.equal(formatRequestedSummaryEntryCount(7), "7 entries");
});

test("workshop movement direction accepts common G-C and C-G spellings", () => {
  assert.equal(getRequestedSummaryWorkshopMovementDirection("INBOUND (G to C)"), "in");
  assert.equal(getRequestedSummaryWorkshopMovementDirection("G-C 2-AUG"), "in");
  assert.equal(getRequestedSummaryWorkshopMovementDirection("G–C Movement"), "in");
  assert.equal(getRequestedSummaryWorkshopMovementDirection("OUTBOUND (C to G)"), "out");
  assert.equal(getRequestedSummaryWorkshopMovementDirection("C-G 2-AUG"), "out");
  assert.equal(getRequestedSummaryWorkshopMovementDirection("RST PM"), "");
});

test("request summary UI uses the revised headings and concise sentence templates", () => {
  assert.match(depotStablingSource, /Request Summary by Type/);
  assert.match(depotStablingSource, /title: "Other Requests"/);
  assert.match(depotStablingSource, /title: "Workshop In Movement"/);
  assert.match(depotStablingSource, /title: "Workshop Out Movement"/);
  assert.match(depotStablingSource, /workshop in movement from G to C/);
  assert.match(depotStablingSource, /workshop out movement from C to G/);
  assert.match(depotStablingSource, /scheduled for washing on \$\{washDate\}/);
  assert.match(depotStablingSource, /formatRequestedSummaryEntryCount\(group\.lines\.length\)/);
  assert.doesNotMatch(depotStablingSource, /Request Type Summary/);
  assert.doesNotMatch(depotStablingSource, /requested for inbound movement G to C/);
});

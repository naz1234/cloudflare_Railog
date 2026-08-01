import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  addOnBeforeRequestedSummaryTrailingDate,
  formatRequestedSummaryEntryCount,
  formatRequestedSummaryOtherAction,
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

test("request summary UI uses the revised headings and concise sentence templates", () => {
  assert.match(depotStablingSource, /Request Summary by Type/);
  assert.match(depotStablingSource, /title: "Other Requests"/);
  assert.match(depotStablingSource, /inbound movement from G to C/);
  assert.match(depotStablingSource, /scheduled for washing on \$\{washDate\}/);
  assert.match(depotStablingSource, /formatRequestedSummaryEntryCount\(group\.lines\.length\)/);
  assert.doesNotMatch(depotStablingSource, /Request Type Summary/);
  assert.doesNotMatch(depotStablingSource, /requested for inbound movement G to C/);
});

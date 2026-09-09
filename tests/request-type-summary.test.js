import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import * as summaryHelpers from "../src/lib/requestedActionSummary.js";
import {
  addOnBeforeRequestedSummaryTrailingDate,
  formatRequestedSummaryEntryCount,
  formatRequestedSummaryOtherAction,
  formatRequestedSummaryWashingAction,
  formatRequestedSummaryWorkshopAction,
  getRequestedSummaryWorkshopMovementDirection,
  normalizeRequestedSummaryDates,
  removeRequestedSummaryLeadingSeparator,
} from "../src/lib/requestedActionSummary.js";

const depotStablingSource = readFileSync(
  new URL("../src/pages/DepotStabling.jsx", import.meta.url),
  "utf8",
).replace(/\r\n/g, "\n");

// Exercise the actual page's grouping logic without loading its browser UI or services.
const summaryRuntime = createContext({
  ...summaryHelpers,
  TOMORROW_REQUEST_TOKENS: new Set(["TOM", "TMR", "TMRW", "TOMORROW"]),
});
for (const name of ["normalizeTrainId", "padTrainId", "formatTrainNumberOnly", "formatRequestedTrainNumber", "cleanRequestLabel", "normalizeRequestIdentity", "hasTomorrowRequestToken", "getTrainRequestDisplayType", "getTrainRequestGroupDisplayTitle"]) {
  const start = depotStablingSource.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} must exist`);
  runInContext(depotStablingSource.slice(start, depotStablingSource.indexOf("\n}", start) + 2), summaryRuntime);
}
runInContext(depotStablingSource.slice(
  depotStablingSource.indexOf("function formatRequestedSummaryTrainLabel("),
  depotStablingSource.indexOf("\nconst REQUESTED_ACTION_SUMMARY_GROUPS"),
), summaryRuntime);
function summarize(requests) {
  return Array.from(summaryRuntime.buildRequestedActionSummaryLines(summaryRuntime.getRequestedActionSummaryRowsFromRequests(requests)));
}

test("request summary dates use one readable format", () => {
  assert.equal(normalizeRequestedSummaryDates("01AUG"), "1 Aug");
  assert.equal(normalizeRequestedSummaryDates("1-AUG"), "1 Aug");
  assert.equal(normalizeRequestedSummaryDates("1-Aug"), "1 Aug");
  assert.equal(removeRequestedSummaryLeadingSeparator("- 01AUG"), "1 Aug");
  assert.equal(addOnBeforeRequestedSummaryTrailingDate("RST PM 1-AUG"), "RST PM on 1 Aug");
  assert.equal(normalizeRequestedSummaryDates("SEP 08"), "8 Sep");
  assert.equal(normalizeRequestedSummaryDates("September-09"), "9 Sep");
  assert.equal(normalizeRequestedSummaryDates("08-SEP-2026"), "8 Sep 2026");
  assert.equal(normalizeRequestedSummaryDates("08 SEP-26"), "8 Sep 26");
  assert.equal(normalizeRequestedSummaryDates("SEP 08-26"), "8 Sep 26");
  assert.equal(addOnBeforeRequestedSummaryTrailingDate("RST PM ON 08-SEP"), "RST PM on 8 Sep");
});

test("request summary actions use grammatical operational wording", () => {
  assert.equal(formatRequestedSummaryOtherAction("Always manNED"), "remain manned at all times");
  assert.equal(formatRequestedSummaryOtherAction("ATC TESTING"), "ATC testing");
  assert.equal(formatRequestedSummaryOtherAction("RESTRICTED"), "restricted operation");
  assert.equal(formatRequestedSummaryOtherAction("UNFIT / PARK MODE"), "unfit / park mode");
  assert.equal(formatRequestedSummaryOtherAction("ATC Inspection 1-Aug"), "ATC inspection on 1 Aug");
  assert.equal(formatRequestedSummaryOtherAction("APU Alarm"), "APU alarm");
  assert.equal(formatRequestedSummaryOtherAction("SET 25C"), "set the temperature to 25°C");
  assert.equal(formatRequestedSummaryOtherAction("Set 25.5 °C"), "set the temperature to 25.5°C");
  assert.equal(formatRequestedSummaryOtherAction("APU HVAC"), "APU HVAC");
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
  assert.match(depotStablingSource, /title: "Other Remarks"/);
  assert.match(depotStablingSource, /title: "Workshop Movement"/);
  assert.doesNotMatch(depotStablingSource, /title: "Workshop (?:In|Out) Movement"/);
  assert.match(depotStablingSource, /formatRequestedSummaryEntryCount\(group\.lines\.length\)/);
  assert.doesNotMatch(depotStablingSource, /Request Type Summary/);
  assert.doesNotMatch(depotStablingSource, /requested for inbound movement G to C/);
});

test("washing sentences distinguish dates, relative timing and work with RST", () => {
  assert.equal(formatRequestedSummaryWashingAction("WASH 10-SEP"), "scheduled for washing on 10 Sep");
  assert.equal(formatRequestedSummaryWashingAction("WASH WITH RST SEP 08"), "washing requested with RST on 8 Sep");
  assert.equal(formatRequestedSummaryWashingAction("WASH WITH RST PM ON 08-SEP"), "washing requested with RST PM on 8 Sep");
  assert.equal(formatRequestedSummaryWashingAction("WASH TONIGHT"), "scheduled for washing tonight");
  assert.equal(formatRequestedSummaryWashingAction("WASH"), "scheduled for washing");
});

test("workshop summaries preserve each movement's date and other qualifiers", () => {
  assert.equal(formatRequestedSummaryWorkshopAction("G-C 09-SEP"), "workshop movement from G to C on 9 Sep");
  assert.equal(formatRequestedSummaryWorkshopAction("G-C TONIGHT"), "workshop movement from G to C tonight");
  assert.equal(formatRequestedSummaryWorkshopAction("OUTBOUND (C to G) SEP 10"), "workshop movement from C to G on 10 Sep");
  assert.equal(formatRequestedSummaryWorkshopAction("G2C TMR"), "workshop movement from G to C tomorrow");
  assert.equal(formatRequestedSummaryWorkshopAction("G-C AFTER TEST"), "workshop movement from G to C (AFTER TEST)");
  assert.deepEqual(summarize([
    { trainId: "T43", requestType: "G-C 09-SEP" },
    { trainId: "T44", requestType: "G-C TONIGHT" },
  ]), [
    "T43 — workshop movement from G to C on 9 Sep.",
    "T44 — workshop movement from G to C tonight.",
  ]);
});

test("requests do not imply completed work and TLC subtypes remain distinct", () => {
  assert.deepEqual(summarize([
    { trainId: "T17", requestType: "DEEP CLEANING" },
    { trainId: "T14", requestType: "TLC CCTV" },
    { trainId: "T09", requestType: "TLC AMPLIFIER" },
    { trainId: "T32", requestType: "SET 25C" },
    { trainId: "T36", requestType: "SET 25C" },
  ]), [
    "T17 — requested for deep cleaning.",
    "T14 — requested for TLC CCTV.",
    "T09 — requested for TLC amplifier.",
    "T32 and T36 — set the temperature to 25°C.",
  ]);
});

test("PM grouping retains readable dates, all dates and hidden request groups", () => {
  assert.deepEqual(summarize([
    { trainId: "T25", requestType: "RST PM 08-SEP" },
    { trainId: "T27", requestType: "RST PM SEP 08" },
    { trainId: "T25", requestType: "RST PM 08-SEP" },
    { trainId: "T43", requestType: "RST PM 09-SEP", groupHidden: true },
  ]), [
    "T25 and T27 — requested for RST PM on 8 Sep.",
    "T43 — requested for RST PM on 9 Sep.",
  ]);
});

test("washing with RST PM remains a washing request and restrictions stay intact", () => {
  assert.deepEqual(summarize([
    { trainId: "T17", requestType: "WASH WITH RST PM SEP 08" },
    { trainId: "T18", requestType: "WASH 8-SEP" },
    { trainId: "T39", requestType: "WASH 9-SEP" },
    { trainId: "T11", requestType: "DONT WASH 48HRS" },
  ]), [
    "T17 — washing requested with RST PM on 8 Sep.",
    "T18 — scheduled for washing on 8 Sep.",
    "T39 — scheduled for washing on 9 Sep.",
    "T11 — do not wash for 48 hours.",
  ]);
});

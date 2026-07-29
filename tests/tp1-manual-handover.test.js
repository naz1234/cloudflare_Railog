import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildTp1ManualCmmsHandoverLine,
  formatTp1HandoverConfirmedBy,
} from "../src/lib/tp1ManualHandover.js";

const depotStablingSource = readFileSync(
  new URL("../src/pages/DepotStabling.jsx", import.meta.url),
  "utf8",
);

test("manual CMMS handover keeps the standard line when the report option is unticked", () => {
  assert.equal(
    buildTp1ManualCmmsHandoverLine({ time: "18:18", cmmsNumber: "5086" }),
    "18:18 hrs – CMMS handover completed. Handover #5086.",
  );
});

test("manual CMMS handover includes the named maintenance report confirmation", () => {
  assert.equal(
    buildTp1ManualCmmsHandoverLine({
      time: "18:18",
      cmmsNumber: "5086",
      l3ReportUpdatedToMaintenance: true,
      confirmedBy: "SIRAJ",
    }),
    "18:18 hrs – CMMS handover completed. Handover #5086. As per Siraj, the L3 report has already been updated to maintenance, so no need to update the HO section.",
  );
});

test("manual CMMS handover supports an unattributed maintenance report confirmation", () => {
  assert.equal(
    buildTp1ManualCmmsHandoverLine({
      time: "18:18",
      cmmsNumber: "5086",
      l3ReportUpdatedToMaintenance: true,
    }),
    "18:18 hrs – CMMS handover completed. Handover #5086. The L3 report has already been updated to maintenance, so no need to update the HO section.",
  );
});

test("manual CMMS handover preserves an Unplanned movement SR number", () => {
  assert.equal(
    buildTp1ManualCmmsHandoverLine({
      time: "18:18",
      cmmsNumber: "5086",
      srNumber: "10121125",
      l3ReportUpdatedToMaintenance: true,
      confirmedBy: "Siraj",
    }),
    "18:18 hrs – CMMS handover completed. Handover #5086 with SR #10121125. As per Siraj, the L3 report has already been updated to maintenance, so no need to update the HO section.",
  );
});

test("confirmed-by names are normalized for the generated sentence", () => {
  assert.equal(formatTp1HandoverConfirmedBy("  mohd SIRAJ  "), "Mohd Siraj");
});

test("the Manual Area flow wires the maintenance-report tick and confirmation field", () => {
  assert.match(depotStablingSource, /label: "L3 Report Updated to MAINT"/);
  assert.match(depotStablingSource, /role="checkbox"/);
  assert.match(depotStablingSource, /Tick IF No need add "Hand Over Process"/);
  assert.match(depotStablingSource, /label: "Confirmed by \(Optional\)"/);
  assert.match(depotStablingSource, /label: "Confirmed by \(Optional\)",\s*visible: manualCmmsReady,/);
  assert.match(depotStablingSource, /buildTp1ManualCmmsHandoverLine\(\{/);
});

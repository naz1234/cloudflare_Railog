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

test("the Manual Area flow combines maintenance confirmation into one dropdown step", () => {
  assert.match(depotStablingSource, /label: "If No need update"/);
  assert.match(depotStablingSource, /const TP1_MAINT_REPORT_CONFIRMERS = \["Siraj", "Rayan"\];/);
  assert.match(depotStablingSource, /<select\s+aria-label="Confirmed by"/);
  assert.match(depotStablingSource, /<option value="">Choose name if no update is needed<\/option>/);
  assert.match(depotStablingSource, /updateTp1ModeForm\(movementType, "l3ReportUpdatedToMaintenance", Boolean\(confirmedBy\)\)/);
  assert.doesNotMatch(depotStablingSource, /label: "Confirmed by \(Optional\)"/);
  assert.doesNotMatch(depotStablingSource, /Tick IF No need add "Hand Over Process"/);
  assert.match(depotStablingSource, /buildTp1ManualCmmsHandoverLine\(\{/);
});

test("optional TP1 details are separated from the required movement flow", () => {
  assert.equal(
    (depotStablingSource.match(/label: "Next Wash Optional",\s+optional: true,/g) || []).length,
    2,
  );
  assert.match(depotStablingSource, /label: "If No need update",\s+optional: true,/);
  assert.match(depotStablingSource, /const requiredFlowSteps = visibleFlowSteps\.filter\(\(step\) => !step\.optional\);/);
  assert.match(depotStablingSource, /const optionalFlowSteps = visibleFlowSteps\.filter\(\(step\) => step\.optional\);/);
  assert.match(depotStablingSource, /data-movement-flow-section="optional"/);
  assert.match(depotStablingSource, />\s*Optional\s*<\/span>/);
  assert.match(depotStablingSource, /Complete only when applicable/);
  assert.match(depotStablingSource, /renderTp1FlowRows\(optionalFlowSteps, requiredFlowSteps\.length, "optional"\)/);
  assert.match(depotStablingSource, /step\.complete \? "DONE" : step\.optional \? "OPTIONAL" : "NEXT"/);
});

test("Automatic Area Train Prep and PST fields are optional details", () => {
  assert.match(
    depotStablingSource,
    /label: "Train Prep Completed",\s+optional: true,\s+visible: automaticCmmsReady,/,
  );
  assert.match(
    depotStablingSource,
    /label: "PST Performed",\s+optional: true,\s+visible: automaticCmmsReady,/,
  );
  assert.match(
    depotStablingSource,
    /const automaticCompletedDcReady = automaticStablingReady &&/,
  );
  assert.doesNotMatch(
    depotStablingSource,
    /const automaticTrainPrepReady = automaticStablingReady &&/,
  );
  assert.doesNotMatch(
    depotStablingSource,
    /const automaticPstReady = automaticTrainPrepReady &&/,
  );
});

test("the production arrival transform reads the nested Manual Area form", () => {
  const manualArrivalPluginSource = readFileSync(
    new URL("../build/manualArrivalTimePlugin.js", import.meta.url),
    "utf8",
  );

  assert.match(manualArrivalPluginSource, /const manualForm = tp1Form\.manual \|\| \{\};/);
  assert.match(manualArrivalPluginSource, /isCompleteMovementTimeInput\(modeForm\.toManual\)/);
  assert.doesNotMatch(manualArrivalPluginSource, /isCompleteMovementTimeInput\(tp1Form\.toManual\)/);
});

test("the required SR Number step uses the normal non-animated label style", () => {
  const manualSrPluginSource = readFileSync(
    new URL("../build/manualUnplannedSrPlugin.js", import.meta.url),
    "utf8",
  );
  const indexCssSource = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");

  assert.match(manualSrPluginSource, /label: "SR Number :"/);
  assert.doesNotMatch(manualSrPluginSource, /movement-flow-sr-label-attention/);
  assert.doesNotMatch(indexCssSource, /movement-flow-sr-label-glow/);
  assert.doesNotMatch(indexCssSource, /movement-flow-sr-label-attention/);
});

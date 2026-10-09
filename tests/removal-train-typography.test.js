import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const maintenanceSource = readFileSync(new URL("../src/components/MaintenancePanel.jsx", import.meta.url), "utf8");
const removalSource = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");
const slateCss = readFileSync(new URL("../src/removalSummarySlate.css", import.meta.url), "utf8");
const trainInput = removalSource.match(/<input\s+ref=\{\(element\) => setTrainRemTrainIdRef[\s\S]*?\/>/)?.[0];

test("Removal Summary train numbers match Maintenance semibold weight while preserving duplicate styling", () => {
  assert.ok(trainInput, "the Removal Summary train input exists");
  assert.match(maintenanceSource, /<span\s+className="theme-maintenance-train-connection-trigger [^"]*text-\[12px\] font-semibold[^"]*"[\s\S]*?>\{chipLabel\}<\/span>/);
  assert.match(trainInput, /hasDuplicateValue \? "font-normal" : "font-semibold"/);
  assert.doesNotMatch(trainInput, /font-bold/);
});

test("compact Removal Summary train numbers retain the matching 12px size", () => {
  const compactRules = slateCss.slice(slateCss.indexOf("@container removal-summary (max-width: 360px)"));
  assert.match(compactRules, /\.theme-train-rem-row-card\[data-preset\]\[data-tid\] input \{ font-size: 12px; \}/);
});

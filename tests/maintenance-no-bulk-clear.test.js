import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panel = readFileSync(new URL("../src/components/MaintenancePanel.jsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");
const preview = readFileSync(new URL("../scripts/preview-compact-slate.jsx", import.meta.url), "utf8");
const mainPanel = page.match(/<MaintenancePanel\s+requests=\{requests\}[\s\S]*?\/>/)?.[0];

test("Maintenance has no bulk-clear handler or callback in the main page, Insertion or local preview", () => {
  assert.ok(mainPanel);
  assert.doesNotMatch(mainPanel, /onClearAll/);
  assert.doesNotMatch(page, /handleClearAllRequests|onClearMaintenanceRequests/);
  assert.doesNotMatch(preview, /onClearAll/);
  assert.match(panel, /typeof onClearAll === "function" && requests\.length > 0/);
});

test("individual and group deletion remain available while PST keeps its separate clear action", () => {
  assert.match(mainPanel, /onRemove=\{handleRemoveRequest\}/);
  assert.match(mainPanel, /onDeleteGroup=\{handleDeleteRequestGroup\}/);
  assert.match(page, /onClearAll=\{onClearPSTRequests\}/);
  assert.match(page, /const handleClearPSTRequests = async/);
});

test("clearing an uploaded wash review is labelled Clear Preview, not Clear All", () => {
  const previewClearButton = panel.match(/<button\s+type="button"\s+onClick=\{handleClearExcelWashReview\}[\s\S]*?<\/button>/)?.[0];
  assert.ok(previewClearButton);
  assert.match(previewClearButton, /Clear Preview/);
  assert.doesNotMatch(previewClearButton, /Clear All/);
});

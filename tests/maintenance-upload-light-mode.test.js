import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const maintenancePanelSource = readFileSync(
  new URL("../src/components/MaintenancePanel.jsx", import.meta.url),
  "utf8",
);
const imageReaderSource = readFileSync(
  new URL("../src/components/MaintenanceImageSummary.jsx", import.meta.url),
  "utf8",
);
const themeStyles = readFileSync(
  new URL("../src/index.css", import.meta.url),
  "utf8",
);

test("maintenance upload tools expose dedicated light-theme hooks", () => {
  assert.match(maintenancePanelSource, /theme-maintenance-upload-card--wash/);
  assert.match(imageReaderSource, /theme-maintenance-upload-card--image/);
  assert.equal(
    (maintenancePanelSource.match(/theme-maintenance-upload-button/g) || []).length,
    2,
  );
  assert.equal(
    (imageReaderSource.match(/theme-maintenance-upload-button/g) || []).length,
    2,
  );
});

test("light mode uses light card surfaces with white upload-button content", () => {
  assert.match(
    themeStyles,
    /theme-maintenance-upload-card--wash[\s\S]*?background:[^;]*#ecfeff/i,
  );
  assert.match(
    themeStyles,
    /theme-maintenance-upload-card--image[\s\S]*?background:[^;]*#faf5ff/i,
  );
  assert.match(
    themeStyles,
    /theme-maintenance-upload-button \*[\s\S]*?color: #ffffff !important;/,
  );
});

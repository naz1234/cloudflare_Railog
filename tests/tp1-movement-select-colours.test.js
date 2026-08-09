import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const depotStablingSource = readFileSync(
  new URL("../src/pages/DepotStabling.jsx", import.meta.url),
  "utf8",
);
const themeStyles = readFileSync(
  new URL("../src/index.css", import.meta.url),
  "utf8",
);

test("Automatic and Manual movement dropdowns share the readable select styling", () => {
  const planSelects = depotStablingSource.match(
    /label: "Plan \/ Unplanned"[\s\S]{0,500}?<select[\s\S]{0,300}?className=\{inputClass\}/g,
  ) || [];
  const shunterSelects = depotStablingSource.match(
    /label: "Shunter Name"[\s\S]{0,500}?<select[\s\S]{0,300}?className=\{inputClass\}/g,
  ) || [];

  assert.equal(planSelects.length, 2);
  assert.equal(shunterSelects.length, 2);
});

test("dark movement option menus use a dark surface with light text", () => {
  assert.match(
    themeStyles,
    /select\.theme-tp1-inline-field-control\s*\{[^}]*color-scheme: dark;[^}]*color: #f8fafc;/s,
  );
  assert.match(
    themeStyles,
    /select\.theme-tp1-inline-field-control option\s*\{[^}]*color: #e6f1fb;[^}]*background: #071827;/s,
  );
  assert.match(
    themeStyles,
    /select\.theme-tp1-inline-field-control option:checked\s*\{[^}]*color: #ffffff;[^}]*background: #164e73;/s,
  );
});

test("light movement option menus use a white surface with dark text", () => {
  assert.match(
    themeStyles,
    /html\[data-app-theme="light"\][^{]*select\.theme-tp1-inline-field-control\s*\{[^}]*color-scheme: light !important;[^}]*color: #172b3f !important;/s,
  );
  assert.match(
    themeStyles,
    /html\[data-app-theme="light"\][^{]*select\.theme-tp1-inline-field-control option\s*\{[^}]*color: #172b3f !important;[^}]*background: #ffffff !important;/s,
  );
  assert.match(
    themeStyles,
    /html\[data-app-theme="light"\][^{]*select\.theme-tp1-inline-field-control option:checked\s*\{[^}]*color: #0f172a !important;[^}]*background: #dbeafe !important;/s,
  );
});

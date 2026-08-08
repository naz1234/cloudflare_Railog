import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/pages/DepotStabling.jsx", import.meta.url),
  "utf8",
);

test("Maintenance and Removal Summary use the compact shared side-panel spacing", () => {
  assert.match(
    source,
    /theme-stabling-workspace grid gap-3 items-start/,
  );
  assert.match(
    source,
    /theme-stabling-side-panels flex items-start gap-3 sticky/,
  );
});

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
  assert.match(source, /gridTemplateColumns: "954px auto"/);
  assert.doesNotMatch(source, /gridTemplateColumns: "960px auto"/);
  assert.match(source, /data-stabling-design="compact-slate"[^\n]*style=\{\{ width: 954, maxWidth: 954 \}\}/);
});

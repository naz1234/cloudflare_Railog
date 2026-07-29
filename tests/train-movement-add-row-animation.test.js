import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const depotStablingSource = readFileSync(
  new URL("../src/pages/DepotStabling.jsx", import.meta.url),
  "utf8",
);
const themeStyles = readFileSync(
  new URL("../src/index.css", import.meta.url),
  "utf8",
);

test("only the movement Add Row action receives the attention animation hook", () => {
  assert.equal(
    (depotStablingSource.match(/theme-movement-add-row-attention/g) || []).length,
    1,
  );
  assert.match(
    depotStablingSource,
    /theme-movement-add-row-attention[^>]*>[\s\S]*?<Plus size=\{12\} \/>Add Row/,
  );
});

test("the Add Row animation includes a reduced-motion fallback", () => {
  assert.match(themeStyles, /@keyframes movement-add-row-attention/);
  assert.match(themeStyles, /@keyframes movement-add-row-icon-attention/);
  assert.match(
    themeStyles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?theme-movement-add-row-attention/,
  );
});

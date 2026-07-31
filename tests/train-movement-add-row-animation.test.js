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

test("the movement Add Row action keeps the attention animation hook", () => {
  assert.equal(
    (depotStablingSource.match(/theme-movement-add-row-attention/g) || []).length,
    2,
  );
  assert.match(
    depotStablingSource,
    /theme-movement-add-row-attention[^>]*>[\s\S]*?<Plus size=\{12\} \/>Add Row/,
  );
});

test("selected PST and insertion PG controls reuse the Add Row animation", () => {
  assert.equal(
    (depotStablingSource.match(/<InsertionPgHeaderControls/g) || []).length,
    2,
  );
  assert.match(
    depotStablingSource,
    /theme-insertion-pg-button \$\{selected \? "is-selected theme-movement-add-row-attention" : ""\}/,
  );
  assert.doesNotMatch(themeStyles, /@keyframes theme-pg-selected-attention/);
});

test("the Add Row animation includes a reduced-motion fallback", () => {
  assert.match(themeStyles, /@keyframes movement-add-row-attention/);
  assert.match(themeStyles, /@keyframes movement-add-row-icon-attention/);
  assert.match(
    themeStyles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?theme-movement-add-row-attention/,
  );
});

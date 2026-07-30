import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const insertionSource = readFileSync(
  new URL("../src/pages/DepotStabling.jsx", import.meta.url),
  "utf8",
);

test("insertion cards render one shared refresh control before the card header", () => {
  const refreshAnchor = 'wrapperClassName="theme-insertion-card-refresh-trigger"';
  const refreshOccurrences = insertionSource.split(refreshAnchor).length - 1;
  const refreshIndex = insertionSource.indexOf(refreshAnchor);
  const cardHeaderIndex = insertionSource.indexOf('className="theme-insertion-card-header');

  assert.equal(refreshOccurrences, 1);
  assert.ok(refreshIndex >= 0);
  assert.ok(refreshIndex < cardHeaderIndex);
  assert.match(insertionSource, /\{key && inserted && \(\s*<ActionTooltip/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const insertionSource = readFileSync(
  new URL("../src/pages/DepotStabling.jsx", import.meta.url),
  "utf8",
);
const stylesheetSource = readFileSync(
  new URL("../src/index.css", import.meta.url),
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

test("light mode keeps the refresh control above the train input click layer", () => {
  assert.match(
    stylesheetSource,
    /html\[data-app-theme="light"\] \.theme-insertion-page \.theme-insertion-card > \.theme-insertion-card-refresh-trigger \{\s*z-index: 8 !important;\s*pointer-events: auto !important;/,
  );
  assert.match(
    stylesheetSource,
    /\.theme-insertion-card-refresh-trigger > \.theme-insertion-card-refresh \{\s*pointer-events: auto !important;/,
  );
});

test("sticky app header stays above insertion PG controls while scrolling", () => {
  const headerZ = Number(
    insertionSource.match(/<header className="app-top-header[^"]*z-\[(\d+)\]"/)?.[1],
  );
  const controlsStart = insertionSource.indexOf("function InsertionPgHeaderControls");
  const controlsEnd = insertionSource.indexOf("function InsertionCell", controlsStart);
  const controlsSource = insertionSource.slice(controlsStart, controlsEnd);
  const controlZLevels = [...controlsSource.matchAll(/relative z-(\d+) inline-flex/g)]
    .map((match) => Number(match[1]));

  assert.ok(Number.isFinite(headerZ));
  assert.ok(controlZLevels.length > 0);
  assert.ok(controlZLevels.every((controlZ) => headerZ > controlZ));
});

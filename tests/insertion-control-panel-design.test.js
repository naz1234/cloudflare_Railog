import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const tidReferenceSource = readFileSync(
  new URL("../src/components/TIDReferenceTable.jsx", import.meta.url),
  "utf8",
);
const depotStablingSource = readFileSync(
  new URL("../src/pages/DepotStabling.jsx", import.meta.url),
  "utf8",
);
const themeStyles = readFileSync(
  new URL("../src/index.css", import.meta.url),
  "utf8",
);

const insertionComponent = depotStablingSource.slice(
  depotStablingSource.indexOf("function InsertionTabContent"),
  depotStablingSource.indexOf("// ── Train Movement Internal Page"),
);

test("Insertion displays one full-width control dashboard before both depot references", () => {
  const dashboardIndex = insertionComponent.indexOf("controlsOnly={true}");
  const westReferenceIndex = insertionComponent.indexOf('depotFilter="west"');
  const eastReferenceIndex = insertionComponent.indexOf('depotFilter="east"');

  assert.ok(dashboardIndex >= 0);
  assert.ok(westReferenceIndex > dashboardIndex);
  assert.ok(eastReferenceIndex > westReferenceIndex);
  assert.match(tidReferenceSource, /if \(controlsOnly\) \{[\s\S]*theme-insertion-reference-controls-only/);
  assert.match(insertionComponent, /depotFilter="west"[\s\S]*showHeader=\{false\}/);
});

test("dashboard keeps live date, clock, depot sound, and timetable controls", () => {
  assert.match(tidReferenceSource, /className="insertion-dashboard__day">\{formatDay\(now\)\}/);
  assert.match(tidReferenceSource, /className="insertion-dashboard__date">\{formatDate\(now\)\}/);
  assert.match(tidReferenceSource, /className="insertion-dashboard__time"[\s\S]*\{currentTimeStr\}/);
  assert.match(tidReferenceSource, /\["east", "west"\]\.map/);
  assert.match(tidReferenceSource, /<SoundIcon enabled=\{enabled\}/);
  assert.match(tidReferenceSource, /aria-pressed=\{enabled\}/);
  assert.match(tidReferenceSource, /role="tablist"/);
  assert.match(tidReferenceSource, /aria-selected=\{isActive\}/);
});

test("dashboard follows the supplied illuminated glass design responsively", () => {
  assert.match(themeStyles, /\.theme-insertion-page \.insertion-dashboard \{/);
  assert.match(themeStyles, /radial-gradient\(circle at 84% 20%/);
  assert.match(themeStyles, /\.insertion-dashboard__clock-ring \{/);
  assert.match(themeStyles, /\.insertion-dashboard__sound-button\.is-enabled \{/);
  assert.match(themeStyles, /border-color: rgba\(251, 191, 36, 0\.90\)/);
  assert.match(themeStyles, /\.insertion-dashboard__schedule-tab\.is-active \{/);
  assert.match(themeStyles, /linear-gradient\(135deg, #0284c7 0%, #2563eb 62%, #263fbd 100%\)/);
  assert.match(themeStyles, /@media \(max-width: 640px\)[\s\S]*\.insertion-dashboard__sound-row,[\s\S]*grid-template-columns: 1fr/);
});

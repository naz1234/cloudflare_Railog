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

test("Insertion displays one compact control dashboard above the West Depot reference", () => {
  const dashboardIndex = insertionComponent.indexOf("controlsOnly={true}");
  const westReferenceIndex = insertionComponent.indexOf('depotFilter="west"');
  const eastReferenceIndex = insertionComponent.indexOf('depotFilter="east"');

  assert.ok(dashboardIndex >= 0);
  assert.ok(westReferenceIndex > dashboardIndex);
  assert.ok(eastReferenceIndex > westReferenceIndex);
  assert.match(tidReferenceSource, /if \(controlsOnly\) \{[\s\S]*theme-insertion-reference-controls-only/);
  assert.match(insertionComponent, /className="self-start space-y-3"[\s\S]*controlsOnly=\{true\}[\s\S]*depotFilter="west"/);
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

test("dashboard uses compact operational sizing instead of presentation sizing", () => {
  assert.match(themeStyles, /\.theme-insertion-page \.insertion-dashboard \{[\s\S]*padding: 14px 18px 13px/);
  assert.match(themeStyles, /\.insertion-dashboard__top \{[\s\S]*min-height: 58px/);
  assert.match(themeStyles, /\.insertion-dashboard__clock-orb \{[\s\S]*width: 52px;[\s\S]*height: 52px/);
  assert.match(themeStyles, /\.insertion-dashboard__time \{[\s\S]*font-size: clamp\(38px, 4\.6vw, 56px\)/);
  assert.match(themeStyles, /\.insertion-dashboard__sound-button \{[\s\S]*min-height: 34px/);
  assert.match(themeStyles, /\.insertion-dashboard__schedule-tab \{[\s\S]*min-height: 38px/);
});

test("sidebar dashboard matches the West Depot reference width and stays compact", () => {
  assert.match(themeStyles, /\.theme-insertion-reference-controls-only \{[\s\S]*width: clamp\(250px, 26vw, 340px\)/);
  assert.match(themeStyles, /\.theme-insertion-reference-controls-only \.insertion-dashboard__top \{[\s\S]*min-height: 42px/);
  assert.match(themeStyles, /\.theme-insertion-reference-controls-only \.insertion-dashboard__time \{[\s\S]*font-size: 23px/);
  assert.match(themeStyles, /\.theme-insertion-reference-controls-only \.insertion-dashboard__sound-row \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(themeStyles, /\.theme-insertion-reference-controls-only \.insertion-dashboard__schedule \{[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
});

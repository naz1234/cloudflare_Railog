import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  formatRemovalStablingStatusMessage,
  getOffPeakStablingMatch,
  shouldShowRemovalTidStablingRemove,
} from "../src/lib/trainRemOffPeakStabling.js";

const depotStablingSource = readFileSync(
  new URL("../src/pages/DepotStabling.jsx", import.meta.url),
  "utf8",
);
const themeStyles = readFileSync(
  new URL("../src/index.css", import.meta.url),
  "utf8",
);

test("off-peak stabling matches normalize train IDs and identify WD or ED", () => {
  assert.deepEqual(
    getOffPeakStablingMatch("03", new Set(["T003"]), new Set()),
    {
      trainKey: "T3",
      depotCodes: ["WD"],
      tooltip: "Train found in WD Stabling. Remove ?",
    },
  );
  assert.deepEqual(
    getOffPeakStablingMatch("T28", [], ["28"]),
    {
      trainKey: "T28",
      depotCodes: ["ED"],
      tooltip: "Train found in ED Stabling. Remove ?",
    },
  );
  assert.equal(getOffPeakStablingMatch("T41", ["T08"], ["T28"]), null);
});

test("a train found in both stabling depots reports both locations once", () => {
  assert.deepEqual(
    getOffPeakStablingMatch("T08", ["08", "T08"], ["T008"]),
    {
      trainKey: "T8",
      depotCodes: ["WD", "ED"],
      tooltip: "Train found in WD and ED Stabling. Remove ?",
    },
  );
});

test("scheduled removal matches use the Train Request stabling message format", () => {
  assert.equal(
    formatRemovalStablingStatusMessage("West Depot STB 15 Block 03"),
    "Train already at STB 15 Block 03",
  );
  assert.equal(
    formatRemovalStablingStatusMessage([
      "West Depot STB 12 Block 04",
      "East Depot STB 02 Block 07",
    ]),
    "Train already at STB 12 Block 04 / STB 02 Block 07",
  );
  assert.equal(formatRemovalStablingStatusMessage([]), "");
});

test("the stabling-conflict control is limited to 9am and 7pm Removal TID rows", () => {
  const stablingMatch = getOffPeakStablingMatch("T03", ["T03"], []);

  assert.equal(shouldShowRemovalTidStablingRemove({ selectedPreset: "9am", referenceOnly: true, stablingMatch }), true);
  assert.equal(shouldShowRemovalTidStablingRemove({ selectedPreset: "7pm", referenceOnly: true, stablingMatch }), true);
  assert.equal(shouldShowRemovalTidStablingRemove({ selectedPreset: "12am", referenceOnly: true, stablingMatch }), false);
  assert.equal(shouldShowRemovalTidStablingRemove({ selectedPreset: "9am", referenceOnly: false, stablingMatch }), false);
  assert.equal(shouldShowRemovalTidStablingRemove({ selectedPreset: "9am", referenceOnly: true, stablingMatch: null }), false);
});

test("Removal Summary uses exact stabling locations while off-peak removal still clears only its row", () => {
  assert.match(depotStablingSource, /collectStablingTrainIds\(westData, WEST_ROADS\)/);
  assert.match(
    depotStablingSource,
    /Object\.keys\(eastData \|\| \{\}\)\.length \? eastData : eastStablingData/,
  );
  assert.match(depotStablingSource, /getOffPeakStablingMatch\([\s\S]*?westStablingTrainIds,[\s\S]*?eastStablingTrainIds/);
  assert.match(depotStablingSource, /getMainStablingLocations\(westData, sourceData\)/);
  assert.match(depotStablingSource, /shouldShowRemovalTidStablingRemove\(\{[\s\S]*?selectedPreset,[\s\S]*?referenceOnly,/);
  assert.match(depotStablingSource, /showRemovalStablingStatus = Boolean\([\s\S]*?realReferenceScheduleMatch[\s\S]*?removalStablingStatusMessage/);
  assert.match(depotStablingSource, /showOffPeakStablingRemove = Boolean\([\s\S]*?referenceDisplayOnly/);
  assert.match(depotStablingSource, /data-removal-tid-stabling-remove=\{offPeakStablingMatch\.depotCodes\.join\("-"\)\}/);
  assert.match(depotStablingSource, /message=\{offPeakStablingMatch\.tooltip\}/);
  assert.match(depotStablingSource, /updateTrainRemCell\(depot, index, "trainId", ""\)/);
  assert.doesNotMatch(depotStablingSource, /data-removal-tid-stabling-remove[\s\S]{0,900}setWestData|data-removal-tid-stabling-remove[\s\S]{0,900}setEastData/);
});

test("scheduled removals use the Train Request tick while off-peak rows keep the PR 279 remove control", () => {
  assert.match(depotStablingSource, /showRemovalTidStablingRemove = shouldShowRemovalTidStablingRemove/);
  assert.match(depotStablingSource, /data-removal-stabling-status=\{offPeakStablingMatch\.depotCodes\.join\("-"\)\}/);
  assert.match(depotStablingSource, /showRemovalStablingStatus[\s\S]*?<Check className="h-\[9px\] w-\[9px\] stroke-\[3\.5\] text-white"/);
  assert.match(depotStablingSource, /showRemovalStablingStatus[\s\S]*?<ActionTooltip[\s\S]*?message=\{removalStablingStatusMessage\}[\s\S]*?placement="top"[\s\S]*?align="start"/);
  assert.doesNotMatch(depotStablingSource, /showRemovalStablingStatus[\s\S]{0,1600}?already-status-bubble/);
  assert.match(depotStablingSource, /className="theme-train-rem-offpeak-remove[^"\n]*"/);
  assert.match(depotStablingSource, /showOffPeakStablingRemove[\s\S]*?updateTrainRemCell\(depot, index, "trainId", ""\)/);
  assert.doesNotMatch(depotStablingSource, /data-removal-tid-stabling-remove[\s\S]{0,900}setWestData|data-removal-tid-stabling-remove[\s\S]{0,900}setEastData/);
});

test("the compact remove button has explicit dark and light mode contrast", () => {
  assert.match(themeStyles, /\.theme-train-rem-offpeak-remove\s*\{[^}]*color: #ffffff;[^}]*background: #941c24;[^}]*border-color: rgba\(252,165,165,0\.85\);/s);
  assert.match(themeStyles, /html\[data-app-theme="light"\] \.theme-train-rem-offpeak-remove\s*\{[^}]*color: #ffffff !important;[^}]*background: #941c24 !important;[^}]*border-color: rgba\(252,165,165,0\.85\) !important;/s);
  assert.match(themeStyles, /\.theme-train-rem-offpeak-remove:hover,[\s\S]*?background: #c92a35;/);
});

test("the remove button uses an attention animation with a reduced-motion fallback", () => {
  assert.match(themeStyles, /@keyframes train-rem-offpeak-remove-attention\s*\{/);
  assert.match(themeStyles, /animation: train-rem-offpeak-remove-attention 1\.2s ease-in-out infinite;/);
  assert.match(
    themeStyles,
    /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.theme-train-rem-offpeak-remove\s*\{[\s\S]*?animation: none !important;/,
  );
});

test("the overlaid remove button does not shift the Train ID away from center", () => {
  assert.match(
    depotStablingSource,
    /value=\{row\.trainId\}[\s\S]*?className=\{`[^`]*px-1 text-center[^`]*`\}/,
  );
  assert.doesNotMatch(
    depotStablingSource,
    /showOffPeakStablingRemove \? "pl-1 pr-4"/,
  );
});

test("the remove button is centered on the Train ID and TID divider", () => {
  assert.match(
    depotStablingSource,
    /gridTemplateColumns: "18% 18% 22% 42%"[\s\S]*?style=\{\{ left: "18%", transform: "translate\(-50%, -50%\)" \}\}/,
  );
  assert.doesNotMatch(
    depotStablingSource,
    /left: "calc\(18% - 17px\)"/,
  );
});

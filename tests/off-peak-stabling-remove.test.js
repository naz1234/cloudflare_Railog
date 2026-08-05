import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getOffPeakStablingMatch,
  shouldShowOffPeakStablingRemove,
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

test("the remove control is limited to true 9am and 7pm off-peak rows", () => {
  const stablingMatch = getOffPeakStablingMatch("T03", ["T03"], []);

  assert.equal(shouldShowOffPeakStablingRemove({ selectedPreset: "9am", referenceDisplayOnly: true, stablingMatch }), true);
  assert.equal(shouldShowOffPeakStablingRemove({ selectedPreset: "7pm", referenceDisplayOnly: true, stablingMatch }), true);
  assert.equal(shouldShowOffPeakStablingRemove({ selectedPreset: "12am", referenceDisplayOnly: true, stablingMatch }), false);
  assert.equal(shouldShowOffPeakStablingRemove({ selectedPreset: "9am", referenceDisplayOnly: false, stablingMatch }), false);
  assert.equal(shouldShowOffPeakStablingRemove({ selectedPreset: "9am", referenceDisplayOnly: true, stablingMatch: null }), false);
});

test("Removal Summary uses stabling-only data and clears only the off-peak Train ID", () => {
  assert.match(depotStablingSource, /collectStablingTrainIds\(westData, WEST_ROADS\)/);
  assert.match(
    depotStablingSource,
    /Object\.keys\(eastData \|\| \{\}\)\.length \? eastData : eastStablingData/,
  );
  assert.match(depotStablingSource, /getOffPeakStablingMatch\([\s\S]*?westStablingTrainIds,[\s\S]*?eastStablingTrainIds/);
  assert.match(depotStablingSource, /shouldShowOffPeakStablingRemove\(\{[\s\S]*?selectedPreset,[\s\S]*?referenceDisplayOnly,/);
  assert.match(depotStablingSource, /data-off-peak-stabling-remove=\{offPeakStablingMatch\.depotCodes\.join\("-"\)\}/);
  assert.match(depotStablingSource, /message=\{offPeakStablingMatch\.tooltip\}/);
  assert.match(depotStablingSource, /updateTrainRemCell\(depot, index, "trainId", ""\)/);
  assert.doesNotMatch(depotStablingSource, /data-off-peak-stabling-remove[\s\S]{0,900}setWestData|data-off-peak-stabling-remove[\s\S]{0,900}setEastData/);
});

test("the compact remove button has explicit dark and light mode contrast", () => {
  assert.match(themeStyles, /\.theme-train-rem-offpeak-remove\s*\{[^}]*background: #4a1720;[^}]*border-color: #fb7185;/s);
  assert.match(themeStyles, /html\[data-app-theme="light"\] \.theme-train-rem-offpeak-remove\s*\{[^}]*background: #fff1f2 !important;[^}]*border-color: #e11d48 !important;/s);
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

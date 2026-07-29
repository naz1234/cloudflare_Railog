import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const depotStablingSource = readFileSync(
  new URL("../src/pages/DepotStabling.jsx", import.meta.url),
  "utf8",
);

const manualSrPluginSource = readFileSync(
  new URL("../build/manualUnplannedSrPlugin.js", import.meta.url),
  "utf8",
);

test("TP1 Add to Log remains available before the flow is complete", () => {
  const buttonStart = depotStablingSource.indexOf("onClick={() => addTp1MovementLog(movementType)}");
  const buttonEnd = depotStablingSource.indexOf("</button>", buttonStart);
  const buttonSource = depotStablingSource.slice(buttonStart, buttonEnd);

  assert.ok(buttonStart >= 0, "TP1 Add to Log button should exist");
  assert.doesNotMatch(buttonSource, /disabled=/);
  assert.match(buttonSource, /Add current \$\{modeTitle\} details to the log/);
});

test("saved partial logs do not use preview-only sample values", () => {
  assert.match(depotStablingSource, /train \|\| \(preview \? "T19" : "Train"\)/);
  assert.match(depotStablingSource, /form\.trAtTp1 \|\| \(preview \? "18:20" : ""\)/);
  assert.match(depotStablingSource, /form\.shunterName \|\| \(preview \? "ALVIN" : ""\)/);
  assert.doesNotMatch(depotStablingSource, /if \(!preview\) \{\s*const missing = \[\]/);
});

test("the SR build transform no longer restores a completion gate", () => {
  assert.doesNotMatch(manualSrPluginSource, /Manual Area Add to Log readiness/);
  assert.doesNotMatch(manualSrPluginSource, /SR validation/);
});

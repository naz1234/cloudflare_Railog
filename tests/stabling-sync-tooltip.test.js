import test from "node:test";
import assert from "node:assert/strict";
import { getStablingSyncTooltipCopy } from "../src/lib/stablingSyncTooltip.js";

for (const [depotCode, depotName] of [["WD", "West Depot"], ["ED", "East Depot"]]) {
  test(`${depotName} insertion popup explains its selected-depot reset`, () => {
    const copy = getStablingSyncTooltipCopy({ depotCode, isDirty: true });
    assert.equal(copy.title, `Sync ${depotName}`);
    assert.equal(copy.description, "Use the latest layout from Main Stabling.");
    assert.equal(copy.warning, `Clears ${depotName} insertion entries and TID inputs.`);
    assert.ok(copy.accessibleLabel.includes(copy.warning));
    assert.ok(!copy.warning.includes("PST"));
  });

  test(`${depotName} PST popup includes Train Prep and TA names`, () => {
    const copy = getStablingSyncTooltipCopy({ depotCode, workLabel: "PST / Train Prep", isDirty: true });
    assert.equal(copy.title, `Sync ${depotName} — PST`);
    assert.equal(copy.warning, `Clears ${depotName} PST and Train Prep entries, logs and TA names.`);
    assert.ok(copy.accessibleLabel.includes(copy.warning));
    assert.ok(!copy.warning.includes("TID inputs"));
  });

  for (const workLabel of ["insertion", "PST / Train Prep"]) {
    test(`${depotName} ${workLabel} synced status does not suggest clearing work`, () => {
      const copy = getStablingSyncTooltipCopy({ depotCode, workLabel, isDirty: false });
      assert.ok(copy.title.includes(depotName));
      assert.ok(copy.title.endsWith("is up to date"));
      assert.equal(copy.description, "Already matches Main Stabling.");
      assert.equal(copy.warning, "");
      assert.ok(!copy.accessibleLabel.includes("Clears"));
    });
  }
}

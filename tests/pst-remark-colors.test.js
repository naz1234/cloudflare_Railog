import assert from "node:assert/strict";
import test from "node:test";

import {
  getPSTRemarkAccent,
  isGreenPSTRemarkAccent,
} from "../src/lib/pstRemarkColors.js";

test("PST remarks replace green accents with stable non-green colours", () => {
  const greenAccents = ["#22c55e", "#34d399", "#10b981", "#4ade80", "#84cc16"];

  greenAccents.forEach((greenAccent) => {
    const remapped = getPSTRemarkAccent(greenAccent, "445");
    assert.equal(isGreenPSTRemarkAccent(remapped), false);
    assert.equal(getPSTRemarkAccent(greenAccent, "445"), remapped);
  });
});

test("PST remarks retain existing non-green accents", () => {
  ["#fbbf24", "#38bdf8", "#f472b6", "#818cf8"].forEach((accent) => {
    assert.equal(getPSTRemarkAccent(accent, "5454"), accent);
  });
});

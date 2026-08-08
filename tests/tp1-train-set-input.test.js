import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  cleanTp1TrainSetInput,
  isCompleteTp1TrainSetInput,
} from "../src/lib/tp1TrainSet.js";

const depotStablingSource = readFileSync(
  new URL("../src/pages/DepotStabling.jsx", import.meta.url),
  "utf8",
);

test("TP1 Train Set input keeps only the first two digits", () => {
  assert.equal(cleanTp1TrainSetInput("1"), "1");
  assert.equal(cleanTp1TrainSetInput("09"), "09");
  assert.equal(cleanTp1TrainSetInput("T019"), "01");
  assert.equal(cleanTp1TrainSetInput("12A3"), "12");
});

test("TP1 Train Set becomes complete only after exactly two digits", () => {
  assert.equal(isCompleteTp1TrainSetInput(""), false);
  assert.equal(isCompleteTp1TrainSetInput("1"), false);
  assert.equal(isCompleteTp1TrainSetInput("01"), true);
  assert.equal(isCompleteTp1TrainSetInput("19"), true);
  assert.equal(isCompleteTp1TrainSetInput("123"), false);
});

test("Automatic and Manual Train Set controls share the two-digit gate", () => {
  assert.equal(
    (depotStablingSource.match(/isCompleteTp1TrainSetInput\(modeForm\.trainSet\)/g) || []).length,
    2,
  );
  assert.equal(
    (depotStablingSource.match(/inputMode="numeric"\s+maxLength=\{2\}\s+value=\{modeForm\.trainSet \|\| ""\}/g) || []).length,
    2,
  );
  assert.equal(
    (depotStablingSource.match(/cleanTp1TrainSetInput\(e\.target\.value\)/g) || []).length,
    2,
  );
});

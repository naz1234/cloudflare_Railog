import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  formatOdoWorkshopTrainText,
  normalizeOdoWorkshopTrainToken,
  parseOdoWorkshopTrainText,
} from "../src/lib/odoWorkshopTrains.js";

const odoReadingSource = readFileSync(new URL("../src/components/OdoReading.jsx", import.meta.url), "utf8");

test("ODO workshop text accepts leading-zero and plain train numbers", () => {
  assert.equal(normalizeOdoWorkshopTrainToken("02"), "TS02");
  assert.equal(normalizeOdoWorkshopTrainToken("2"), "TS02");
  assert.equal(normalizeOdoWorkshopTrainToken("T15"), "TS15");
  assert.equal(normalizeOdoWorkshopTrainToken("TS27"), "TS27");
});

test("ODO workshop text parses the requested space-separated format", () => {
  assert.deepEqual(parseOdoWorkshopTrainText("02 15 27 31"), ["TS02", "TS15", "TS27", "TS31"]);
  assert.deepEqual(parseOdoWorkshopTrainText("2, 02; 48 0 31"), ["TS02", "TS31"]);
});

test("ODO workshop text restores a normalized editable list", () => {
  assert.equal(formatOdoWorkshopTrainText({ TS31: true, TS02: true, TS15: false, TS27: true }), "02 27 31");
});

test("ODO Input replaces per-row workshop ticks with one bulk text control", () => {
  assert.match(odoReadingSource, /id="odo-workshop-trains"/);
  assert.match(odoReadingSource, /placeholder="02 15 27 31"/);
  assert.match(odoReadingSource, /02 = Train 2 \(TS02\)/);
  assert.match(odoReadingSource, /handleWorkshopTrainTextApply/);
  assert.doesNotMatch(odoReadingSource, /handleWorkshopToggle/);
  assert.doesNotMatch(odoReadingSource, /type="checkbox"/);
});

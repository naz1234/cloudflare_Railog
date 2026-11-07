import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const depotStablingSource = readFileSync(
  new URL("../src/pages/DepotStabling.jsx", import.meta.url),
  "utf8",
);

test("WENDELL is available in the shared shunter name list", () => {
  const optionList = depotStablingSource.match(
    /const SHUNTER_NAME_OPTIONS = \[([\s\S]*?)\r?\n  \];/,
  );

  assert.ok(optionList, "expected the shared shunter name list to exist");
  assert.match(optionList[1], /"WENDELL"/);
});

test("automatic and manual area movements use the shared shunter name list", () => {
  const sharedListUsages = depotStablingSource.match(
    /SHUNTER_NAME_OPTIONS\.map/g,
  );

  assert.equal(sharedListUsages?.length, 2);
});

test("ALWANY is available once without removing any existing shunter names", () => {
  const optionList = depotStablingSource.match(
    /const SHUNTER_NAME_OPTIONS = \[([\s\S]*?)\r?\n  \];/,
  );
  assert.ok(optionList, "expected the shared shunter name list to exist");
  const names = [...optionList[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  assert.equal(names.filter((name) => name === "ALWANY").length, 1);
  for (const name of ["PAUL", "FAZREEN", "ARSHAD", "BBOSA", "AKMAL", "KRISNA", "GERALD", "LEO", "FARAS", "MIRAN", "WENDELL"]) {
    assert.ok(names.includes(name), `${name} must remain available`);
  }
});

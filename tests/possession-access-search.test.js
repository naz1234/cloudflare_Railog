import assert from "node:assert/strict";
import test from "node:test";
import { searchPossessionAccessEntries } from "../src/lib/possessionAccessLog.js";

const entries = [
  { entryId: "first-pic", picName: "First PIC", accessDetails: [{ accessNo: "303,004" }, { accessNo: "#303005" }] },
  { entryId: "second-pic", picName: "Second PIC", accessNo: "401001 / 401002", handbackTime: "14:00" },
];

test("access search finds any permit belonging to a PIC, including formatted numbers", () => {
  for (const query of ["303004", "303,004", " #303004 ", "Access #303004"]) {
    assert.deepEqual(searchPossessionAccessEntries(entries, query), [{ entryId: "first-pic", index: 0, accessNumbers: ["303004"] }]);
  }
  assert.deepEqual(searchPossessionAccessEntries(entries, "303005"), [{ entryId: "first-pic", index: 0, accessNumbers: ["303005"] }]);
  assert.deepEqual(searchPossessionAccessEntries(entries, "401002"), [{ entryId: "second-pic", index: 1, accessNumbers: ["401002"] }]);
});

test("partial access numbers list matching permits without duplicating a PIC or permit", () => {
  const repeated = [{ ...entries[0], accessDetails: [...entries[0].accessDetails, { accessNo: "303004" }] }];
  assert.deepEqual(searchPossessionAccessEntries(repeated, "3030"), [{ entryId: "first-pic", index: 0, accessNumbers: ["303004", "303005"] }]);
});

test("duplicate numbers across PICs return both entries in their original order", () => {
  const sameNumber = [entries[0], { ...entries[1], accessNo: "303004" }];
  assert.deepEqual(searchPossessionAccessEntries(sameNumber, "303004").map((match) => match.entryId), ["first-pic", "second-pic"]);
});

test("empty and missing queries do not list all PICs or match descriptions", () => {
  for (const query of ["", "  ", "#", ",", null]) assert.deepEqual(searchPossessionAccessEntries(entries, query), []);
  assert.deepEqual(searchPossessionAccessEntries(entries, "999999"), []);
  assert.deepEqual(searchPossessionAccessEntries([{ picName: "303004", description: "303004" }], "303004"), []);
  assert.deepEqual(searchPossessionAccessEntries(null, "303004"), []);
});

test("legacy multi-number rows and missing entry IDs use the same entry identity as normalization", () => {
  assert.deepEqual(searchPossessionAccessEntries([null, { accessDetails: [{ accessNo: "303004 / 303005" }] }], "3030"), [
    { entryId: "legacy-access-2", index: 1, accessNumbers: ["303004", "303005"] },
  ]);
});

test("search keeps depot data independent, includes returned and draft permits, and never mutates data", () => {
  const snapshot = JSON.stringify(entries);
  assert.equal(searchPossessionAccessEntries([entries[0]], "401002").length, 0);
  assert.equal(searchPossessionAccessEntries([entries[1]], "401002").length, 1);
  assert.equal(searchPossessionAccessEntries([entries[0]], "303004").length, 1);
  assert.equal(JSON.stringify(entries), snapshot);
});

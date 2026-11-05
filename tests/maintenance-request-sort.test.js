import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sortRequestsByStatusThenTrain } from "../src/utils/maintenanceRequestSort.js";

const getStatusReason = (request) => request.status;
const getTrainKey = (request) => request.trainId;

test("puts green-tick stabling trains before other request statuses", () => {
  const requests = [
    { trainId: "03", status: "" },
    { trainId: "09", status: "STABLING" },
    { trainId: "04", status: "" },
  ];

  assert.deepEqual(
    sortRequestsByStatusThenTrain(requests, getStatusReason, getTrainKey).map((request) => request.trainId),
    ["09", "03", "04"],
  );
});

test("keeps train-number order inside each status and places pending last", () => {
  const requests = [
    { trainId: "27", status: "" },
    { trainId: "11", status: "WORKSHOP" },
    { trainId: "09", status: "STABLING" },
    { trainId: "05", status: "STABLING" },
    { trainId: "03", status: "WORKSHOP" },
    { trainId: "04", status: "" },
  ];

  assert.deepEqual(
    sortRequestsByStatusThenTrain(requests, getStatusReason, getTrainKey).map((request) => request.trainId),
    ["05", "09", "03", "11", "04", "27"],
  );
});

test("all West green ticks appear before East red ticks, even when red train numbers are lower", () => {
  const requests = [
    { trainId: "11", status: { reason: "STABLING", depot: "east" } },
    { trainId: "24", status: { reason: "STABLING", depot: "west" } },
    { trainId: "13", status: { reason: "STABLING", depot: "east" } },
    { trainId: "12", status: { reason: "STABLING", depot: "west" } },
    { trainId: "42", status: { reason: "STABLING", depot: "west" } },
    { trainId: "30", status: { reason: "STABLING", depot: "east" } },
  ];
  assert.deepEqual(sortRequestsByStatusThenTrain(requests, getStatusReason, getTrainKey).map(request => request.trainId), ["12", "24", "42", "11", "13", "30"]);
});

test("green, red, workshop and pending groups each retain natural train-number order", () => {
  const requests = [
    { trainId: "05", status: {} },
    { trainId: "19", status: { reason: "WORKSHOP" } },
    { trainId: "30", status: { reason: "STABLING", depot: "east" } },
    { trainId: "39", status: { reason: "STABLING", depot: "west" } },
    { trainId: "13", status: { reason: "STABLING", depot: "east" } },
    { trainId: "2", status: { reason: "STABLING", depot: "west" } },
    { trainId: "03", status: { reason: "WORKSHOP" } },
    { trainId: "07", status: null },
  ];
  assert.deepEqual(sortRequestsByStatusThenTrain(requests, getStatusReason, getTrainKey).map(request => request.trainId), ["2", "39", "13", "30", "03", "19", "05", "07"]);
});

test("status sorting is display-only, retains stable ties and never mutates requests or their metadata", () => {
  const requests = [
    { id: "east", trainId: "03", status: { reason: "STABLING", depot: "east" }, groupTitle: "Wash 7-Nov", groupHidden: true },
    { id: "first", trainId: "09", status: { reason: "STABLING", depot: "west" }, groupTitle: "Wash 7-Nov" },
    { id: "second", trainId: "09", status: { reason: "STABLING", depot: "west" }, groupTitle: "Wash 7-Nov" },
  ];
  const original = structuredClone(requests);
  const result = sortRequestsByStatusThenTrain(requests, getStatusReason, getTrainKey);
  assert.deepEqual(result.map(request => request.id), ["first", "second", "east"]);
  assert.equal(result[0], requests[1]);
  assert.deepEqual(requests, original);
});

test("a live change of depot updates ordering using the same status info as the tick", () => {
  const requests = [{ trainId: "01" }, { trainId: "42" }];
  const statuses = new Map([["01", { reason: "STABLING", depot: "west" }], ["42", { reason: "STABLING", depot: "west" }]]);
  const sort = () => sortRequestsByStatusThenTrain(requests, request => statuses.get(request.trainId)).map(request => request.trainId);
  assert.deepEqual(sort(), ["01", "42"]);
  statuses.set("01", { reason: "STABLING", depot: "east" });
  assert.deepEqual(sort(), ["42", "01"]);
  statuses.set("42", {});
  assert.deepEqual(sort(), ["01", "42"]);
});

test("reason-only and missing-depot statuses preserve the existing default green tick behavior", () => {
  const requests = [
    { trainId: "01", status: { reason: "STABLING", depot: "east" } },
    { trainId: "05", status: { reason: "STABLING" } },
    { trainId: "04", status: "STABLING" },
    { trainId: "02", status: undefined },
  ];
  assert.deepEqual(sortRequestsByStatusThenTrain(requests, getStatusReason, getTrainKey).map(request => request.trainId), ["04", "05", "01", "02"]);
  assert.deepEqual(sortRequestsByStatusThenTrain([{ trainId: "12" }, { trainId: "02" }]).map(request => request.trainId), ["02", "12"]);
});

test("the maintenance group sort receives the full depot-aware info used to render its tick", () => {
  const source = readFileSync(new URL("../src/components/MaintenancePanel.jsx", import.meta.url), "utf8");
  assert.match(source, /sortRequestsByStatusThenTrain\(\s*group.items,\s*\(request\) => getCrossOutInfo\(request\),/);
  assert.doesNotMatch(source, /sortRequestsByStatusThenTrain\(\s*group.items,\s*\(request\) => getCrossOutInfo\(request\)\.reason/);
  assert.match(source, /const isEastDepot = reason === "STABLING" && depot === "east"/);
  assert.match(source, /<AlreadyStatusIcon message=\{statusMessage\} reason=\{crossOutInfo.reason\} depot=\{crossOutInfo.depot\}/);
  assert.match(source, /items: sortRequestsByStatusThenTrain/);
  assert.match(source, /groupRequestGroupsByCategory\(regularRequestGroups\)/);
});

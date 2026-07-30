import test from "node:test";
import assert from "node:assert/strict";
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

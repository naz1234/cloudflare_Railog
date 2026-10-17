import assert from "node:assert/strict";
import test from "node:test";
import { buildPossessionDashboard } from "../src/lib/possessionAccessLog.js";

test("each PIC's issued numbers and handbacks are counted, rather than form rows", () => {
  assert.deepEqual(buildPossessionDashboard([
    { picName: "Jay", picId: "FLOW_1113", accessDetails: [{ accessNo: "303004" }, { accessNo: "303005" }], issueTime: "13:02" },
    { picName: "Sam", picId: "FLOW_2222", accessNo: "303006", issueTime: "14:00", handbackTime: "15:00" },
    { picName: "Draft PIC", accessNo: "303007", issueTime: "" },
  ]), { issued: 3, pics: 3, handedBack: 1 });
});

test("repeated numbers, formatted numbers and repeated PICs are counted once", () => {
  assert.deepEqual(buildPossessionDashboard([
    { picName: "Jay", picId: " flow_1113 ", accessDetails: [{ accessNo: "303,004" }, { accessNo: "#303004" }], issueTime: "01:00", handbackTime: "02:00" },
    { picName: "JAY", picId: "FLOW_1113", accessNo: "303004 / 303005 & 303006", issueTime: "03:00", handbackTime: "04:00" },
    { picName: " Sam  Jones ", accessNo: "303007", issueTime: "05:00", handbackTime: "06:00" },
    { picName: "sam jones", accessNo: "303007", issueTime: "05:00", handbackTime: "06:00" },
  ]), { issued: 4, pics: 2, handedBack: 4 });
});

test("drafts, invalid times and handbacks without an issue time do not inflate permit totals", () => {
  assert.deepEqual(buildPossessionDashboard([
    null, {}, { picName: " ", picId: " ", accessNo: "" },
    { accessNo: "1", issueTime: "25:00", handbackTime: "01:00" },
    { accessNo: "2", issueTime: "", handbackTime: "03:00" },
    { accessNo: "3", issueTime: "23:59", handbackTime: "" },
    { accessNo: "4", issueTime: "00:00", handbackTime: "24:60" },
  ]), { issued: 2, pics: 0, handedBack: 0 });
});

test("the same PIC is not counted again when another entry omits their ID", () => {
  assert.equal(buildPossessionDashboard([
    { picName: "Jay Bigcas", picId: "FLOW_1113" },
    { picName: " jay  bigcas ", picId: "" },
  ]).pics, 1);
  assert.equal(buildPossessionDashboard([
    { picName: "Same Name", picId: "FLOW_1" },
    { picName: "Same Name", picId: "FLOW_2" },
  ]).pics, 2);
});

test("a repeated permit stays open until every issued record has a handback time", () => {
  const entries = [
    { accessNo: "303004", issueTime: "01:00", handbackTime: "02:00" },
    { accessNo: "303004", issueTime: "03:00", handbackTime: "" },
  ];
  assert.deepEqual(buildPossessionDashboard(entries), { issued: 1, pics: 0, handedBack: 0 });
  assert.deepEqual(buildPossessionDashboard(entries.map((entry) => ({ ...entry, handbackTime: "04:00" }))), { issued: 1, pics: 0, handedBack: 1 });
  assert.equal(entries[1].handbackTime, "");
});

test("depot totals stay independent and callers may retain legacy time parsing", () => {
  const west = [{ picName: "West PIC", accessNo: "303004", issueTime: "13:00" }];
  const east = [{ picName: "East PIC", accessNo: "303005", issueTime: "1:00 PM", handbackTime: "2:00 PM" }];
  assert.deepEqual(buildPossessionDashboard(west), { issued: 1, pics: 1, handedBack: 0 });
  assert.deepEqual(buildPossessionDashboard(east, (value) => Boolean(value?.endsWith("PM"))), { issued: 1, pics: 1, handedBack: 1 });
  assert.deepEqual(buildPossessionDashboard(null), { issued: 0, pics: 0, handedBack: 0 });
});

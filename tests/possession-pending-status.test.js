import assert from "node:assert/strict";
import test from "node:test";
import { getPossessionEntryPendingStatus } from "../src/lib/possessionAccessLog.js";

const issued = { picName: "Jay", picId: "FLOW_1113", accessNo: "303004 / 303005", issueTime: "13:00", scd: "Yes" };

test("SCD-required access waits for application, then handback, then clears", () => {
  assert.equal(getPossessionEntryPendingStatus(issued), "scd");
  assert.equal(getPossessionEntryPendingStatus({ ...issued, scdApplyTime: "13:05" }), "handback");
  assert.equal(getPossessionEntryPendingStatus({ ...issued, scdApplyTime: "13:05", handbackTime: "14:00" }), "");
  assert.equal(issued.scdApplyTime, undefined);
});

test("No-SCD entries skip the application status and valid handback clears either phase", () => {
  assert.equal(getPossessionEntryPendingStatus({ ...issued, scd: "No" }), "handback");
  assert.equal(getPossessionEntryPendingStatus({ ...issued, handbackTime: "14:00" }), "");
  assert.equal(getPossessionEntryPendingStatus({ ...issued, scd: "No", handbackTime: "14:00" }), "");
});

test("drafts and unissued or anonymous access do not show a pending status", () => {
  for (const entry of [null, {}, { ...issued, issueTime: "" }, { ...issued, issueTime: "25:00" }, { ...issued, accessNo: "" }, { ...issued, picName: "", picId: "" }]) {
    assert.equal(getPossessionEntryPendingStatus(entry), "");
  }
});

test("invalid SCD application times remain pending, but recorded removal does not regress to application", () => {
  assert.equal(getPossessionEntryPendingStatus({ ...issued, scdApplyTime: "25:00" }), "scd");
  assert.equal(getPossessionEntryPendingStatus({ ...issued, scdRemTime: "14:00" }), "handback");
  assert.equal(getPossessionEntryPendingStatus({ ...issued, scdApplyTime: "13:05", handbackTime: "25:00" }), "handback");
});

test("legacy default SCD and saved time parsing stay compatible", () => {
  const legacy = { picName: "Legacy PIC", accessNo: "303004", issueTime: "13:00" };
  assert.equal(getPossessionEntryPendingStatus(legacy), "scd");
  const validLegacyTime = (value) => Boolean(value?.endsWith("PM"));
  assert.equal(getPossessionEntryPendingStatus({ ...issued, issueTime: "1:00 PM", scdApplyTime: "1:05 PM" }, validLegacyTime), "handback");
});

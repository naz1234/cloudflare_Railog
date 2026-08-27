import assert from "node:assert/strict";
import test from "node:test";
import {
  getInsertionSoundTriggerTime,
  isInsertionSoundDue,
} from "../src/lib/insertionSoundTiming.js";

test("insertion sound is scheduled thirty seconds before the insertion time", () => {
  assert.equal(getInsertionSoundTriggerTime("05:25"), "05:24:30");
  assert.equal(getInsertionSoundTriggerTime("00:00"), "23:59:30");
});

test("the thirty-second trigger window tolerates ten-second polling without repeating after insertion", () => {
  assert.equal(isInsertionSoundDue("05:25", "05:24:29"), false);
  assert.equal(isInsertionSoundDue("05:25", "05:24:30"), true);
  assert.equal(isInsertionSoundDue("05:25", "05:24:39"), true);
  assert.equal(isInsertionSoundDue("05:25", "05:24:59"), true);
  assert.equal(isInsertionSoundDue("05:25", "05:25:00"), false);
});

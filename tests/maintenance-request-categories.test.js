import test from "node:test";
import assert from "node:assert/strict";
import { getRequestedSummaryCategoryKey, groupRequestGroupsByCategory } from "../src/lib/requestedActionSummary.js";

test("editable request labels use the same categories as summary sentences", () => {
  const cases = [
    ["WASH 1-OCT", "washing"],
    ["DONT WASH 48HRS", "washing"],
    ["RST PM 02-OCT", "pm"],
    ["RST CM", "cm"],
    ["TLC Req after comm svc", "tlc"],
    ["CC RESET PENDING - ATC", "atc"],
    ["ATC Inspection 2-Oct", "atc"],
    ["G-C UNPLANNED - SR PENDING", "workshop"],
    ["OUTBOUND (C to G)", "workshop"],
    ["DEEP CLEAN", "others"],
    ["SET 25C", "others"],
    ["FIT BUT LEAST PRIORITY", "others"],
    ["Always manned - RST MUSTAFA", "others"],
  ];
  cases.forEach(([label, category]) => {
    assert.equal(getRequestedSummaryCategoryKey(label), category);
    assert.equal(getRequestedSummaryCategoryKey(`T10 and T20 — ${label}.`), category);
  });
});

test("category grouping preserves every row, group control data and within-group status order", () => {
  const washItems = [{ id: "w1", trainId: "T19", status: "STABLING" }, { id: "w2", trainId: "T11", status: "" }];
  const washOne = { key: "wash1", label: "WASH 1-OCT", items: washItems, hidden: true };
  const washTwo = { key: "wash2", label: "WASH 2-OCT", items: [{ id: "w3", trainId: "T19" }] };
  const atc = { key: "atc", label: "CC RESET PENDING - ATC", items: [{ id: "a1", trainId: "T19" }] };
  const other = { key: "other", label: "DEEP CLEAN", items: [{ id: "o1", trainId: "T40" }] };
  const groups = [atc, other, washOne, washTwo];
  const categories = groupRequestGroupsByCategory(groups);
  assert.deepEqual(categories.map(({ key, requestCount }) => [key, requestCount]), [["atc", 1], ["others", 1], ["washing", 3]]);
  const washing = categories.find(({ key }) => key === "washing");
  assert.deepEqual(washing.groups, [washOne, washTwo]);
  assert.equal(washing.groups[0], washOne);
  assert.equal(washing.groups[0].items, washItems);
  assert.equal(washing.groups[0].hidden, true);
  assert.deepEqual(categories.flatMap(({ groups }) => groups).map(({ key }) => key).sort(), ["atc", "other", "wash1", "wash2"]);
  assert.equal(categories.reduce((sum, { requestCount }) => sum + requestCount, 0), 5);
});

test("empty categories are omitted and populated categories use operational priority order", () => {
  assert.deepEqual(groupRequestGroupsByCategory(), []);
  assert.deepEqual(groupRequestGroupsByCategory([null, { label: "WASH", items: [] }]), []);
  const labels = ["SET 25C", "G-C", "ATC", "TLC", "RST CM", "RST PM", "WASH"];
  const categories = groupRequestGroupsByCategory(labels.map((label) => ({ label, items: [{}] })));
  assert.deepEqual(categories.map(({ title }) => title), ["Workshop Movement", "PM", "CM", "ATC Req", "TLC Req", "Other Remarks", "Washing"]);
});

test("workshop remains first and washing last regardless of input order or missing categories", () => {
  const cases = [
    [["WASH", "TLC", "RST PM", "G-C"], ["workshop", "pm", "tlc", "washing"]],
    [["RST CM", "ATC", "SET 25C", "WASH", "G-C"], ["workshop", "cm", "atc", "others", "washing"]],
    [["WASH", "ATC", "RST PM"], ["pm", "atc", "washing"]],
    [["SET 25C", "TLC", "G-C"], ["workshop", "tlc", "others"]],
  ];
  for (const [labels, expected] of cases) {
    for (const input of [labels, [...labels].reverse()]) {
      const categories = groupRequestGroupsByCategory(input.map((label) => ({ label, items: [{}] })));
      assert.deepEqual(categories.map(({ key }) => key), expected);
    }
  }
});

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
    ["TFT issue", "tlc"],
    ["ACES Req", "tlc"],
    ["tft-issue", "tlc"],
    ["Requested by aces", "tlc"],
    ["Comms req", "tlc"],
    ["comm req", "tlc"],
    ["comms imran req", "tlc"],
    ["cOmMs Imran ReQ", "tlc"],
    ["COMM-REQ", "tlc"],
    ["COMMS / IMRAN / REQ", "tlc"],
    ["ATC test with comms imran req", "tlc"],
    ["FIT but LEAST PRIORITY TFT by ACES - 08Oct", "tlc"],
    ["ATC test with TFT issue", "tlc"],
    ["WASH after ACES Req", "tlc"],
    ["FACES issue", "others"],
    ["TFTS fault", "others"],
    ["COMMAND req", "others"],
    ["COMMERCIAL req", "others"],
    ["CC RESET PENDING - ATC", "atc"],
    ["ATC Inspection 2-Oct", "atc"],
    ["CC technical failure", "atc"],
    ["CC functional failure", "atc"],
    ["cc TECHNICAL failure", "atc"],
    ["CC-functional-failure", "atc"],
    ["CC", "atc"],
    ["CC technical failure with Comms req", "tlc"],
    ["TLC CC functional failure", "tlc"],
    ["PCC technical failure", "others"],
    ["CCU functional failure", "others"],
    ["CCTV failure", "others"],
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

test("COMM and COMMS remark groups share the TLC parent without changing their labels or controls", () => {
  const groups = [
    { key: "comms", label: "Comms req", items: [{ id: "c1", trainId: "T03" }] },
    { key: "comm", label: "comm req", items: [{ id: "c2", trainId: "T04" }] },
    { key: "imran", label: "comms imran req", items: [{ id: "c3", trainId: "T05" }], hidden: true },
  ];
  const categories = groupRequestGroupsByCategory(groups);
  assert.deepEqual(categories.map(({ key, title, requestCount }) => [key, title, requestCount]), [["tlc", "TLC Req", 3]]);
  assert.deepEqual(categories[0].groups, groups);
  groups.forEach((group, index) => {
    assert.equal(categories[0].groups[index], group);
    assert.equal(categories[0].groups[index].items, group.items);
  });
  assert.equal(categories[0].groups[2].hidden, true);
});

test("CC failures share the ATC parent while preserving original groups and controls", () => {
  const groups = [
    { key: "technical", label: "CC technical failure", items: [{ id: "c1", trainId: "T03" }] },
    { key: "functional", label: "CC functional failure", items: [{ id: "c2", trainId: "T04" }], hidden: true },
    { key: "atc", label: "ATC Inspection", items: [{ id: "a1", trainId: "T05" }] },
  ];
  const categories = groupRequestGroupsByCategory(groups);
  assert.deepEqual(categories.map(({ key, title, requestCount }) => [key, title, requestCount]), [["atc", "ATC Req", 3]]);
  assert.deepEqual(categories[0].groups, groups);
  groups.forEach((group, index) => {
    assert.equal(categories[0].groups[index], group);
    assert.equal(categories[0].groups[index].items, group.items);
  });
  assert.equal(categories[0].groups[1].hidden, true);
});

test("category grouping preserves every row, group control data and within-group status order", () => {
  const washItems = [{ id: "w1", trainId: "T19", status: "STABLING" }, { id: "w2", trainId: "T11", status: "" }];
  const washOne = { key: "wash1", label: "WASH 1-OCT", items: washItems, hidden: true };
  const washTwo = { key: "wash2", label: "WASH 2-OCT", items: [{ id: "w3", trainId: "T19" }] };
  const atc = { key: "atc", label: "CC RESET PENDING - ATC", items: [{ id: "a1", trainId: "T19" }] };
  const other = { key: "other", label: "DEEP CLEAN", items: [{ id: "o1", trainId: "T40" }] };
  const tft = { key: "tft", label: "TFT issue", items: [{ id: "t1", trainId: "T04" }, { id: "t2", trainId: "T41" }], hidden: true };
  const aces = { key: "aces", label: "ACES Req", items: [{ id: "a2", trainId: "T12" }] };
  const groups = [atc, other, washOne, tft, washTwo, aces];
  const categories = groupRequestGroupsByCategory(groups);
  assert.deepEqual(categories.map(({ key, requestCount }) => [key, requestCount]), [["atc", 1], ["tlc", 3], ["others", 1], ["washing", 3]]);
  const tlc = categories.find(({ key }) => key === "tlc");
  assert.deepEqual(tlc.groups, [tft, aces]);
  assert.equal(tlc.groups[0], tft);
  assert.equal(tlc.groups[0].items, tft.items);
  assert.equal(tlc.groups[0].hidden, true);
  const washing = categories.find(({ key }) => key === "washing");
  assert.deepEqual(washing.groups, [washOne, washTwo]);
  assert.equal(washing.groups[0], washOne);
  assert.equal(washing.groups[0].items, washItems);
  assert.equal(washing.groups[0].hidden, true);
  assert.deepEqual(categories.flatMap(({ groups }) => groups).map(({ key }) => key).sort(), ["aces", "atc", "other", "tft", "wash1", "wash2"]);
  assert.equal(categories.reduce((sum, { requestCount }) => sum + requestCount, 0), 8);
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

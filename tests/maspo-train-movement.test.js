import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeMaspoMovementSources,
  buildMaspoTrainPattern,
  describeMaspoAreaFlow,
  formatMaspoMovementSummary,
  isSupportedMaspoSpreadsheet,
  normalizeMaspoTrainQuery,
} from "../src/lib/maspoTrainMovement.js";

test("normalizes train input and matches common MASPO train variants", () => {
  assert.deepEqual(normalizeMaspoTrainQuery("TS 027"), {
    number: 27,
    digits: "27",
    label: "T27",
  });

  const pattern = buildMaspoTrainPattern("T27");
  assert.match("TS27 G to C4", pattern);
  assert.match("T 27 C4 - G", pattern);
  assert.match("Train Set 027", pattern);
  assert.match("TR-27", pattern);
  assert.doesNotMatch("TS270", pattern);
});

test("treats two-digit and prefixed values as the same train set", () => {
  const trainSeven = {
    number: 7,
    digits: "7",
    label: "T07",
  };

  ["07", "7", "T07", "TS07"].forEach((value) => {
    assert.deepEqual(normalizeMaspoTrainQuery(value), trainSeven);
  });
  assert.equal(normalizeMaspoTrainQuery("707").label, "T707");
});

test("accepts current Excel formats and rejects unrelated files", () => {
  assert.equal(isSupportedMaspoSpreadsheet("logs/book.xlsx"), true);
  assert.equal(isSupportedMaspoSpreadsheet("logs/book.XLSM"), true);
  assert.equal(isSupportedMaspoSpreadsheet("logs/book.xlsb"), true);
  assert.equal(isSupportedMaspoSpreadsheet("notes.csv"), false);
});

test("describes G and C directions using the requested operational areas", () => {
  assert.equal(describeMaspoAreaFlow("G", "C4"), "Automatic area → Workshop");
  assert.equal(describeMaspoAreaFlow("C10", "G"), "Manual area → Automatic area");
  assert.equal(describeMaspoAreaFlow("C4", "C7"), "");
});

test("finds pending T31 records when workbook names, sheet names, and columns differ", () => {
  const sources = [{
    fileName: "daily-log-any-name.xlsx",
    sheets: [{
      sheetName: "Operations",
      rows: [
        ["Summary", "Location", "OCC Reference Number", "Category", "Time"],
        [
          "Pending Movements:\n- TS31 G - C10 (Planned Movement)",
          "Building D",
          "MASPO-080826-01",
          "Handover",
          "0700H",
        ],
        [
          "Pending Movements:\n- TS31 G to C10 (Planned Movement)",
          "MACR",
          "MASPO-080826-02",
          "Sign in",
          "0730H",
        ],
      ],
    }],
  }];

  const analysis = analyzeMaspoMovementSources(sources, "T31");
  assert.equal(analysis.matchCount, 2);
  assert.equal(analysis.timeline.length, 2);
  assert.equal(analysis.latest.reference, "MASPO-080826-02");
  assert.equal(analysis.latest.status, "Pending");
  assert.equal(analysis.latest.route, "G → C10");
  assert.equal(analysis.latest.areaDetail, "Automatic area → Workshop");
  assert.equal(analysis.latest.planStatus, "Planned");
});

test("reconstructs T27 inbound and overnight outbound movements with MASPO references", () => {
  const sources = [
    {
      fileName: "Line 3 MASPO E-log_070826.xlsx",
      sheets: [{
        sheetName: "QUA-FO-00035",
        rows: [
          ["OCC Reference Number", "Time", "Location", "Category", "Summary"],
          [
            "MASPO-070826-05",
            "1119H",
            "MACR",
            "Shunting TS27 (G to C4) Planned",
            "1119H - DC grants workshop movement.\n1124H - Route set.\n1127H - TS27 full stop.\n1140H - Movement completed for TS27.",
          ],
          [
            "MASPO-070826-11",
            "2300H",
            "MACR",
            "Handover",
            "Pending Movements:\n- TS27 C4 to G (Unplanned)",
          ],
          [
            "MASPO-070826-12",
            "0025H",
            "MACR",
            "Sign In",
            "Pending Movements:\n- TS27 C4 to G (Unplanned)",
          ],
          [
            "MASPO-070826-14",
            "0111H",
            "MACR",
            "TS27 Shunting (C4 - G) Unplanned Movement",
            "0059H - Movement confirmed.\n0110H - Delayed while stingers remained fitted.\n0125H - Route set.\n0135H - Authorized to proceed under MA1001.\n0138H - TS27 reported full stop at TP1.\n0140H - Third rail power switched OFF.",
          ],
        ],
      }],
    },
    {
      fileName: "Line 3 MASPO E-log_080826.xlsx",
      sheets: [{
        sheetName: "Different Sheet Name",
        rows: [
          ["Reference Number", "Activity", "Details", "Event Time", "Area"],
          [
            "MASPO-080826-01",
            "Handover",
            "Completed Movement:\n- TS27 C4 to G (Unplanned)",
            "0700H",
            "Building D",
          ],
        ],
      }],
    },
  ];

  const analysis = analyzeMaspoMovementSources(sources, "TS27");
  assert.equal(analysis.timeline.length, 2);

  const inbound = analysis.timeline[0];
  assert.equal(inbound.reference, "MASPO-070826-05");
  assert.equal(inbound.route, "G → C4");
  assert.equal(inbound.areaDetail, "Automatic area → Workshop");
  assert.equal(inbound.status, "Completed");
  assert.equal(inbound.timeRange, "1119H–1140H");
  assert.equal(inbound.planStatus, "Planned");

  const outbound = analysis.timeline[1];
  assert.equal(outbound.reference, "MASPO-070826-14");
  assert.equal(outbound.route, "C4 → G");
  assert.equal(outbound.areaDetail, "Manual area → Automatic area");
  assert.equal(outbound.status, "Completed");
  assert.equal(outbound.date, "2026-08-08");
  assert.equal(outbound.timeRange, "0059H–0140H");
  assert.equal(outbound.planStatus, "Unplanned");

  assert.equal(analysis.latest.reference, "MASPO-080826-01");
  assert.equal(analysis.latest.status, "Completed");
});

test("formatted output includes MASPO refs and never includes authority-to-proceed details", () => {
  const analysis = analyzeMaspoMovementSources([{
    fileName: "movement.xlsx",
    sheets: [{
      sheetName: "Log",
      rows: [
        ["Reference", "Time", "Category", "Summary"],
        [
          "MASPO-070826-14",
          "0111H",
          "TS27 Shunting (C4 - G) Unplanned Movement",
          "0059H - Started.\n0135H - Authority to Proceed # MA1001.\n0138H - TS27 reported full stop at TP1.\n0140H - Third rail power switched OFF.",
        ],
      ],
    }],
  }], "T27");

  const output = formatMaspoMovementSummary(analysis);
  assert.match(output, /C4 → G — Manual area → Automatic area/);
  assert.match(output, /Ref: MASPO-070826-14/);
  assert.doesNotMatch(output, /G\/TP1/);
  assert.doesNotMatch(output, /authority to proceed/i);
  assert.doesNotMatch(output, /MA1001/i);
});

test("returns a clear no-match result after scanning valid sources", () => {
  const analysis = analyzeMaspoMovementSources([{
    fileName: "other-trains.xlsx",
    sheets: [{
      sheetName: "Log",
      rows: [
        ["OCC Reference Number", "Time", "Category", "Summary"],
        ["MASPO-080826-03", "0815H", "Shunting TS34 C10 to G", "Movement completed for TS34."],
      ],
    }],
  }], "T31");

  assert.equal(analysis.matchCount, 0);
  assert.equal(analysis.latest, null);
  assert.match(formatMaspoMovementSummary(analysis), /No matching MASPO movement record/);
});

test("ignores train faults and never borrows another train's route or completion", () => {
  const analysis = analyzeMaspoMovementSources([{
    fileName: "mixed-events.xlsx",
    sheets: [{
      sheetName: "Log",
      rows: [
        ["Reference", "Time", "Category", "Summary"],
        [
          "MASPO-080826-01",
          "0600H",
          "TS27 Train Fault",
          "TS27 reported full stop at C4 due to a door fault.",
        ],
        [
          "MASPO-080826-02",
          "0700H",
          "Handover",
          "Pending Movements:\n- TS27 awaiting confirmation\n- TS34 C10 to G (Planned Movement)",
        ],
        [
          "MASPO-080826-03",
          "0800H",
          "TS27 Shunting G to C4 Planned Movement",
          "0800H - TS27 route set.\n0810H - Movement completed for TS34.",
        ],
      ],
    }],
  }], "T27");

  assert.equal(analysis.records.some((record) => record.reference === "MASPO-080826-01"), false);
  const pending = analysis.records.find((record) => record.reference === "MASPO-080826-02");
  assert.equal(pending.status, "Pending");
  assert.equal(pending.route, "");
  const targetDetail = analysis.records.find((record) => record.reference === "MASPO-080826-03");
  assert.equal(targetDetail.status, "Movement logged");
});

test("rejects another train's detailed row when its narrative reuses the queried train", () => {
  const analysis = analyzeMaspoMovementSources([{
    fileName: "Line 3 MASPO E-log_August.xlsx",
    sheets: [{
      sheetName: "QUA-FO-00035",
      rows: [
        ["OCC Reference Number", "Time", "Location", "Category", "Summary"],
        [
          "MASPO-050826-12",
          "2105H",
          "MACR",
          "Shunting (G to C7) TS09 Planned",
          "2113H - Route set from TP1 to the manual area for T07.\n2128H - Movement completed for TS09.",
        ],
        [
          "MASPO-060826-11",
          "2049H",
          "MACR",
          "Shunting (G to C7) TS07 Planned",
          "2049H - TS07 handed over at TP1.\n2112H - SCD removed and the manual yard area is clear.",
        ],
        [
          "MASPO-060826-12",
          "2208H",
          "MACR",
          "Shunting (G to C7) TS06 Planned",
          "2217H - Route set from TP1 to the manual area for T07.\n2236H - Movement completed for TS06.",
        ],
        [
          "MASPO-060826-13",
          "2330H",
          "MACR",
          "Handover",
          "Completed Movements:\n- TS07 G to C7 (Planned)",
        ],
        [
          "MASPO-070826-10",
          "2217H",
          "MACR",
          "Shunting (C07 to G) TS07 Unplanned",
          "2217H - Movement authorized for TS07.\n2240H - Informed DC and EFC movement completed for TS07.",
        ],
        [
          "MASPO-070826-11",
          "2300H",
          "MACR",
          "Handover",
          "Completed Movements:\n- TS07 C7 to G (Unplanned)",
        ],
        [
          "MASPO-090826-07",
          "1133H",
          "MACR",
          "TS33 Shuting G to C7 Planned",
          "1138H - Route set from TP1 to the manual area for T7.\n1154H - Movement completed for TS33.",
        ],
      ],
    }],
  }], "T7");

  assert.deepEqual(
    analysis.records.map((record) => record.reference),
    ["MASPO-060826-11", "MASPO-060826-13", "MASPO-070826-10", "MASPO-070826-11"],
  );
  assert.deepEqual(
    analysis.timeline.map((record) => record.reference),
    ["MASPO-060826-11", "MASPO-070826-10"],
  );
  assert.equal(analysis.latest.reference, "MASPO-070826-11");

  const output = formatMaspoMovementSummary(analysis);
  assert.equal(analysis.train, "T07");
  assert.match(output, /^T07 movement check/);
  assert.doesNotMatch(output, /Route not stated/);
  assert.doesNotMatch(output, /MASPO-(?:050826-12|060826-12|090826-07)/);
});

test("prefers the mapped reference and resets rollover when the reference date advances", () => {
  const analysis = analyzeMaspoMovementSources([{
    fileName: "renamed.xlsx",
    sheets: [{
      sheetName: "Flexible",
      rows: [
        ["Summary", "Reference Number", "Activity", "Event Time"],
        [
          "Pending Movements:\n- TS27 G to C4 (Planned Movement); see MASPO-010826-01",
          "MASPO-070826-11",
          "Handover",
          "2300H",
        ],
        [
          "Pending Movements:\n- TS27 C4 to G (Unplanned Movement)",
          "MASPO-080826-02",
          "Sign in",
          "0030H",
        ],
      ],
    }],
  }], "T27");

  assert.deepEqual(analysis.records.map((record) => record.reference), [
    "MASPO-070826-11",
    "MASPO-080826-02",
  ]);
  assert.equal(analysis.records[1].date, "2026-08-08");
});

test("keeps status and route paired when one row has completed and pending sections", () => {
  const analysis = analyzeMaspoMovementSources([{
    fileName: "handover.xlsx",
    sheets: [{
      sheetName: "Log",
      rows: [
        ["Reference", "Time", "Category", "Summary"],
        [
          "MASPO-080826-02",
          "0700H",
          "Handover",
          "Completed Movements:\n- TS27 G to C4 (Planned Movement)\nPending Movements:\n- TS27 C4 to G (Unplanned Movement)",
        ],
      ],
    }],
  }], "T27");

  assert.equal(analysis.records.length, 2);
  assert.deepEqual(
    analysis.records.map((record) => [record.route, record.status]),
    [["G → C4", "Completed"], ["C4 → G", "Pending"]],
  );
  assert.equal(analysis.latest.status, "Pending");
});

test("preserves an overnight time span, displays TP1 as G, and sorts by the row event time", () => {
  const analysis = analyzeMaspoMovementSources([{
    fileName: "overnight.xlsx",
    sheets: [{
      sheetName: "Log",
      rows: [
        ["Reference", "Time", "Category", "Summary"],
        [
          "MASPO-070826-09",
          "2300H",
          "Handover",
          "Pending Movements:\n- TS27 G (TP1) to C4 (Planned Movement)",
        ],
        [
          "MASPO-070826-10",
          "0010H",
          "TS27 Shunting G/TP1 to C4 Planned Movement",
          "2355H - TS27 route set.\n0010H - TS27 movement completed.",
        ],
        [
          "MASPO-080826-01",
          "1200H",
          "TS27 Shunting C4 to G Planned Movement",
          "1200H - TS27 movement completed.",
        ],
      ],
    }],
  }], "T27");

  const overnight = analysis.records.find((record) => record.reference === "MASPO-070826-10");
  assert.equal(overnight.route, "G → C4");
  assert.equal(overnight.areaDetail, "Automatic area → Workshop");
  assert.equal(overnight.timeRange, "2355H–0010H");
  assert.equal(overnight.date, "2026-08-07");
  assert.equal(overnight.endDate, "2026-08-08");
  assert.equal(overnight.spansMidnight, true);
  assert.equal(analysis.latest.reference, "MASPO-080826-01");
});

test("deduplicates archive copies and applies each completion to the nearest prior movement", () => {
  const oldDetail = [
    ["Reference", "Time", "Category", "Summary"],
    [
      "MASPO-010826-01",
      "1200H",
      "TS27 Shunting G to C4 Planned Movement",
      "1200H - TS27 route set.",
    ],
  ];
  const newerRows = [
    ["Reference", "Time", "Category", "Summary"],
    [
      "MASPO-020826-01",
      "0800H",
      "TS27 Shunting G to C4 Planned Movement",
      "0800H - TS27 route set.",
    ],
    [
      "MASPO-020826-02",
      "0900H",
      "Handover",
      "Completed Movements:\n- TS27 G to C4 (Planned Movement)",
    ],
  ];
  const analysis = analyzeMaspoMovementSources([
    { fileName: "copy-a.xlsx", sheets: [{ sheetName: "Log", rows: oldDetail }] },
    { fileName: "copy-b.xlsx", sheets: [{ sheetName: "Log", rows: oldDetail }] },
    { fileName: "next.xlsx", sheets: [{ sheetName: "Log", rows: newerRows }] },
  ], "T27");

  assert.equal(analysis.records.length, 3);
  const details = analysis.timeline.filter((record) => record.detailed);
  assert.equal(details.length, 2);
  assert.equal(details[0].status, "Movement logged");
  assert.equal(details[1].status, "Completed");
});

test("does not use a distant same-route completion to upgrade an old movement", () => {
  const analysis = analyzeMaspoMovementSources([{
    fileName: "month.xlsx",
    sheets: [{
      sheetName: "Log",
      rows: [
        ["Reference", "Time", "Category", "Summary"],
        ["MASPO-010826-01", "1200H", "TS27 Shunting G to C4", "1200H - TS27 route set."],
        ["MASPO-300826-01", "1200H", "Handover", "Completed Movements:\n- TS27 G to C4"],
      ],
    }],
  }], "T27");

  const oldMovement = analysis.timeline.find((record) => record.reference === "MASPO-010826-01");
  assert.equal(oldMovement.status, "Movement logged");
});

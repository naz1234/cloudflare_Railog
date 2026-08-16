import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  applyInsertionAssignmentsToRemovalRows,
  buildInsertionTidAssignments,
} from "../src/lib/trainRemInsertionSync.js";

const depotStablingSource = readFileSync(
  new URL("../src/pages/DepotStabling.jsx", import.meta.url),
  "utf8",
);
const themeStyles = readFileSync(
  new URL("../src/index.css", import.meta.url),
  "utf8",
);

test("Insertion assignments map each three-digit TID to its current train", () => {
  const assignments = buildInsertionTidAssignments({
    data: {
      "WD-ST15": [
        { trainId: "T02" },
        { trainId: "15" },
        { trainId: "T27" },
      ],
    },
    tidInputs: {
      "WD-ST15-0": "122",
      "WD-ST15-1": "TID 123",
    },
    insertionLog: [
      { key: "ins-WD-ST15-2", trainKey: "T27", tid: 124 },
    ],
  });

  assert.deepEqual(assignments, {
    122: "02",
    123: "15",
    124: "27",
  });
});

test("completed entries are ignored after the train in that insertion cell changes", () => {
  const assignments = buildInsertionTidAssignments({
    data: { "ED-ST02": [{ trainId: "T31" }] },
    insertionLog: [
      { key: "ins-ED-ST02-0", trainKey: "T30", tid: 222 },
    ],
  });

  assert.deepEqual(assignments, {});
});

test("Removal Summary fills matching trains and blanks unmatched Train ID and TID only", () => {
  const rows = [
    { trainId: "", tid: "122", timing: "00:08", remark: "Wash" },
    { trainId: "99", tid: "123", timing: "00:14", remark: "PM" },
    { trainId: "31", tid: "222", timing: "00:09", remark: "CM" },
  ];
  const assignments = {
    west: { 122: "02" },
    east: { 222: "31" },
  };

  assert.deepEqual(
    applyInsertionAssignmentsToRemovalRows(
      rows,
      assignments,
      (_row, index) => index === 2 ? "east" : "west",
    ),
    [
      { trainId: "02", tid: "122", timing: "00:08", remark: "Wash" },
      { trainId: "", tid: "", timing: "00:14", remark: "PM" },
      { trainId: "31", tid: "222", timing: "00:09", remark: "CM" },
    ],
  );
});

test("Removal Summary exposes a confirmed INS action through the normal undoable update path", () => {
  assert.match(depotStablingSource, />\s*INS\s*<\/button>/);
  assert.match(
    depotStablingSource,
    /Confirm and update Train ID based on the TID from the Insertion Page\?/,
  );
  assert.match(
    depotStablingSource,
    /const handleTrainRemInsertionSync = \(depot\) => \{[\s\S]*?updateTrainRemState\(\(prev\) =>/,
  );
  assert.match(
    depotStablingSource,
    /insertionAssignmentsByDepot=\{insertionAssignmentsByDepot\}/,
  );
  assert.match(
    themeStyles,
    /html\[data-app-theme="light"\] \.theme-train-rem-toolbar \.theme-train-rem-ins\s*\{[\s\S]*?color: #14532d !important;[\s\S]*?background: #dcfce7 !important;[\s\S]*?border-color: #22c55e !important;/,
  );
});

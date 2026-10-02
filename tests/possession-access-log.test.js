import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildPossessionEntryOutput,
  getPossessionAccessDetails,
  normalizePossessionAccessEntry,
} from "../src/lib/possessionAccessLog.js";

const source = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");
const timeSource = source.slice(source.indexOf("function parsePossessionTimeTo24"), source.indexOf("function cleanPossessionAccessNo"));
const formatTime = new Function(`${timeSource}\nreturn fmtPossession24;`)();
const output = (entry) => buildPossessionEntryOutput(entry, formatTime);
const firstDescription = "Replacement of the IRJ - SA09 - DNF-143-ED IRJ & Weld";
const secondDescription = "GWS, 1 Yearly, Buffer Stops Inspection/Cleaning, Route 15";
const shared = { picName: "Jay Bigcas", picId: "FLOW_1113", accessPoint: "GATE 03", accessAuthTime: "13:02", issueTime: "13:02" };

test("single access uses the requested PIC, numbered description and issued format", () => {
  assert.equal(output({ ...shared, accessNo: "30300", description: firstDescription }), [
    "PIC - Jay Bigcas (FLOW_1113)",
    `Access #30300 – ${firstDescription}`,
    "",
    "13:02 hrs – PIC Jay Bigcas authorized to access GATE 03 and start apply the SCD.",
    "13:02 hrs - CMMS updated to ISSUED (Access #30300)",
  ].join("\n"));
});

test("two descriptions stay paired with their access numbers, including repeated numbers", () => {
  assert.equal(output({ ...shared, accessDetails: [
    { accessNo: "30300", description: firstDescription },
    { accessNo: "30300", description: secondDescription },
  ] }), [
    "PIC - Jay Bigcas (FLOW_1113)",
    `Access #30300 – ${firstDescription}`,
    `Access #30300 – ${secondDescription}`,
    "",
    "13:02 hrs – PIC Jay Bigcas authorized to access GATE 03 and start apply the SCD.",
    "13:02 hrs - CMMS updated to ISSUED (Access #30300 and #30300)",
  ].join("\n"));
});

test("distinct access numbers match their descriptions and both CMMS status lines", () => {
  const result = output({ ...shared, handbackTime: "15:18", accessDetails: [
    { accessNo: "303,004", description: firstDescription },
    { accessNo: "303005", description: secondDescription },
  ] });
  assert.ok(result.includes(`Access #303004 – ${firstDescription}\nAccess #303005 – ${secondDescription}`));
  assert.ok(result.includes("13:02 hrs - CMMS updated to ISSUED (Access #303004 and #303005)"));
  assert.ok(result.endsWith("15:18 hrs - CMMS updated to COMP (Access #303004 and #303005)"));
});

test("three or more access rows use readable references without an arbitrary two-row limit", () => {
  const result = output({ ...shared, accessDetails: [
    { accessNo: "1", description: "First" },
    { accessNo: "2", description: "Second" },
    { accessNo: "3", description: "Third" },
  ] });
  assert.ok(result.includes("Access #1 – First\nAccess #2 – Second\nAccess #3 – Third"));
  assert.ok(result.endsWith("CMMS updated to ISSUED (Access #1, #2 and #3)"));
});

test("SCD apply/remove events and No-SCD behaviour remain unchanged", () => {
  const entry = { ...shared, accessNo: "30300", description: firstDescription, scd: "Yes", scdLoc: "TRACK 11", scdApplyTime: "13:10", scdRemTime: "15:00" };
  assert.ok(output(entry).includes("13:10 hrs - SCD applied at TRACK 11. At 15:00 hrs SCD confirmed removed."));
  const noScd = output({ ...entry, scd: "No" });
  assert.doesNotMatch(noScd, /authorized to access|SCD applied|SCD confirmed removed/);
  assert.match(noScd, /CMMS updated to ISSUED/);
});

test("blank entries generate no output and incomplete rows do not fabricate numbers", () => {
  assert.equal(output(normalizePossessionAccessEntry()), "");
  assert.equal(output({ description: "Unnumbered work" }), "Unnumbered work");
  assert.equal(output({ accessDetails: [{ accessNo: "30300", description: "" }] }), "Access #30300");
  assert.doesNotMatch(output({ ...shared, accessDetails: [{ accessNo: "", description: "" }] }), /CMMS updated|Access #/);
});

test("existing 24-hour validation and saved AM/PM time compatibility still apply", () => {
  assert.match(output({ ...shared, issueTime: "1:02 PM", accessNo: "30300" }), /13:02 hrs - CMMS updated/);
  assert.doesNotMatch(output({ ...shared, issueTime: "25:00", accessAuthTime: "13:61", accessNo: "30300" }), /CMMS updated|authorized to access/);
});

test("legacy slash-separated numbers migrate without losing the shared description or other fields", () => {
  const legacy = { ...shared, accessNo: "303,004 / 303005", description: secondDescription, handbackTime: "15:18", futureField: "retain" };
  const migrated = normalizePossessionAccessEntry(legacy);
  assert.deepEqual(migrated.accessDetails, [
    { accessNo: "303,004", description: secondDescription },
    { accessNo: "303005", description: secondDescription },
  ]);
  assert.equal(migrated.handbackTime, legacy.handbackTime);
  assert.equal(migrated.futureField, "retain");
  assert.equal(migrated.accessNo, legacy.accessNo);
  assert.ok(output(migrated).includes("(Access #303004 and #303005)"));
  assert.equal(legacy.description, secondDescription);
  assert.equal(legacy.accessDetails, undefined);
});

test("thousands commas do not split a single legacy access number", () => {
  assert.deepEqual(getPossessionAccessDetails({ accessNo: "303,004", description: "Work" }), [
    { accessNo: "303,004", description: "Work" },
  ]);
  assert.equal(output({ accessNo: "303,004", description: "Work" }), "Access #303004 – Work");
});

test("legacy number separators and surrounding whitespace normalize safely", () => {
  for (const accessNo of ["303004 / 303005", "303004;303005", "303004 and 303005", "303004 & 303005", "303004\n303005"]) {
    assert.deepEqual(getPossessionAccessDetails({ accessNo }).map((detail) => detail.accessNo), ["303004", "303005"]);
  }
  assert.equal(output({ accessNo: " #30300 ", description: " Work " }), "Access #30300 – Work");
});

test("new access details survive save/reload and take priority over stale legacy fields", () => {
  const entry = { ...shared, accessNo: "old", description: "old", accessDetails: [
    { accessNo: "303004", description: firstDescription },
    { accessNo: "303005", description: secondDescription },
  ] };
  const normalized = normalizePossessionAccessEntry(entry);
  const reloaded = normalizePossessionAccessEntry(JSON.parse(JSON.stringify(normalized)));
  assert.deepEqual(reloaded, normalized);
  assert.equal(output(reloaded), output(entry));
  assert.equal(normalized.accessNo, "303004 / 303005");
  assert.ok(normalized.description.includes(firstDescription));
  assert.ok(normalized.description.includes(secondDescription));
});

test("separate defaults and partial saved records get safe independent details", () => {
  const first = normalizePossessionAccessEntry();
  const second = normalizePossessionAccessEntry(null);
  first.accessDetails[0].description = "Only first";
  assert.equal(second.accessDetails[0].description, "");
  assert.deepEqual(normalizePossessionAccessEntry({ accessDetails: [null] }).accessDetails, [{ accessNo: "", description: "" }]);
  assert.equal(normalizePossessionAccessEntry({ accessDetails: [] }).accessDetails.length, 1);
});

test("removing an access row removes its description and CMMS reference together", () => {
  const entry = normalizePossessionAccessEntry({ ...shared, accessDetails: [
    { accessNo: "303004", description: firstDescription },
    { accessNo: "303005", description: secondDescription },
  ] });
  const reduced = normalizePossessionAccessEntry({ ...entry, accessDetails: entry.accessDetails.filter((_, i) => i !== 0) });
  const result = output(reduced);
  assert.doesNotMatch(result, /303004|Replacement of the IRJ/);
  assert.ok(result.includes(`Access #303005 – ${secondDescription}`));
  assert.ok(result.endsWith("CMMS updated to ISSUED (Access #303005)"));
});

test("PSS local reload and remote normalization keep access details for both depots", () => {
  const logSource = source.slice(source.indexOf("function PossessionLog("), source.indexOf("// ── Section 2:"));
  assert.match(logSource, /saved\.map\(normalizePossessionAccessEntry\)/);
  assert.match(logSource, /value\.map\(normalizePossessionAccessEntry\)/);
  assert.match(logSource, /localStorage\.setItem\(storageKey, JSON\.stringify\(entries\)\)/);
  assert.match(logSource, /getPossessionLiveStateKey\("possession-log", depot\)/);
  assert.match(source, /return buildPossessionEntryOutput\(f, fmtPossession24\)/);
});

test("entry form exposes paired fields and add/remove controls without duplicating PIC or times", () => {
  const formSource = source.slice(source.indexOf("function AccessEntryForm("), source.indexOf("function PossessionLog("));
  assert.match(formSource, /accessDetails\.map\(\(detail, accessIndex\)/);
  assert.match(formSource, /Add Access Number/);
  assert.match(formSource, /Remove access number \$\{accessIndex \+ 1\} for entry \$\{index \+ 1\}/);
  assert.match(formSource, /Access description \$\{accessIndex \+ 1\} for entry \$\{index \+ 1\}/);
  assert.match(formSource, /accessDetails\.length > 1/);
  assert.equal((formSource.match(/label="PIC Name"/g) || []).length, 1);
  assert.equal((formSource.match(/label="Issue Time"/g) || []).length, 1);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";
import ts from "typescript";
import {
  buildPossessionCombinedOutput, buildPossessionDashboard, buildPossessionEntryOutput, buildPossessionSecurityMessage,
  getPossessionAccessDetails, getPossessionEntryPendingStatus, getPossessionSecurityDetails, normalizePossessionAccessEntry, removePossessionAccessEntry,
  searchPossessionAccessEntries,
} from "../src/lib/possessionAccessLog.js";

const entry = { picName: "Jay Bigcas", accessDetails: [{ accessNo: "303,004", description: "Buffer stops inspection" }] };
const manual = { phone: "0501234567", location: "West Depot", gateNo: "03" };

test("security message gets the three shared fields from the access entry", () => {
  assert.equal(buildPossessionSecurityMessage(entry, manual), [
    "PIC Name: Jay Bigcas", "Mobile#: 0501234567", "Access: 303004",
    "Activity: Buffer stops inspection", "Location: West Depot", "Gate Number: 03",
  ].join("\n"));
});

test("stale separately saved PIC/access/activity can never override the source access entry", () => {
  const saved = { ...manual, picName: "Old PIC", accessNo: "999", description: "Old work" };
  assert.equal(buildPossessionSecurityMessage(entry, saved), buildPossessionSecurityMessage(entry, manual));
  assert.doesNotMatch(buildPossessionSecurityMessage(entry, saved), /Old PIC|999|Old work/);
});

test("multiple access numbers retain their paired descriptions, including repeated numbers", () => {
  const result = buildPossessionSecurityMessage({ picName: "Jay", accessDetails: [
    { accessNo: "30300", description: "IRJ replacement" },
    { accessNo: "30300", description: "Buffer stops inspection" },
    { accessNo: "30301", description: "Route 15" },
    { accessNo: "", description: "" },
  ] });
  assert.match(result, /Access: 30300 \/ 30300 \/ 30301\nActivity:\nAccess #30300 – IRJ replacement\nAccess #30300 – Buffer stops inspection\nAccess #30301 – Route 15/);
});

test("legacy slash-separated access numbers and thousands commas are supported", () => {
  const result = buildPossessionSecurityMessage({ picName: "PIC", accessNo: "303,004 / #303005", description: "Work" });
  assert.match(result, /Access: 303004 \/ 303005/);
  assert.match(result, /Access #303004 – Work\nAccess #303005 – Work/);
});

test("entry edits and row removals immediately change the derived output", () => {
  const changed = { ...entry, picName: "New PIC", accessDetails: [{ accessNo: "40001", description: "New work" }] };
  const result = buildPossessionSecurityMessage(changed, manual);
  assert.match(result, /PIC Name: New PIC/);
  assert.match(result, /Access: 40001\nActivity: New work/);
  assert.doesNotMatch(result, /303004|Jay Bigcas|Buffer stops/);
  assert.equal(entry.picName, "Jay Bigcas");
});

test("blank/cleared entries cannot show stale optional or shared security data", () => {
  assert.equal(buildPossessionSecurityMessage(undefined, { ...manual, picName: "Old PIC", accessNo: "999" }), "");
  assert.equal(buildPossessionSecurityMessage(null, null), "");
  assert.equal(buildPossessionSecurityMessage({ picName: "  ", accessDetails: [null] }, manual), "");
  assert.match(buildPossessionSecurityMessage({ description: "Work without number" }), /Activity: Work without number/);
});

const source = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");
const pssSource = source.slice(source.indexOf("function parsePossessionTimeTo24"), source.indexOf("function TimetableHeaderControl("));
const compiled = ts.transpileModule(pssSource, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  fileName: "PSSWorkspace.jsx",
}).outputText;
const pickerModule = { exports: {} };
const pickerCompiled = ts.transpileModule(readFileSync(new URL("../src/components/depot/PossessionEntryPicker.jsx", import.meta.url), "utf8"), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  fileName: "PossessionEntryPicker.jsx",
}).outputText;
const pickerRequire = createRequire(import.meta.url);
new Function("require", "module", "exports", pickerCompiled)((name) => name === "lucide-react" ? icons : pickerRequire(name), pickerModule, pickerModule.exports);
const PossessionEntryPicker = pickerModule.exports.default;
const accessSearchModule = { exports: {} };
const accessSearchCompiled = ts.transpileModule(readFileSync(new URL("../src/components/depot/PossessionAccessSearch.jsx", import.meta.url), "utf8"), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  fileName: "PossessionAccessSearch.jsx",
}).outputText;
new Function("require", "module", "exports", accessSearchCompiled)((name) => {
  if (name === "lucide-react") return icons;
  if (name === "../../lib/possessionAccessLog") return { searchPossessionAccessEntries };
  if (name === "./PossessionEntryPicker") return pickerModule.exports;
  return pickerRequire(name);
}, accessSearchModule, accessSearchModule.exports);
const PossessionAccessSearch = accessSearchModule.exports.default;
const { PossessionAccessSearchResults } = accessSearchModule.exports;

function renderDepot(depot, entries, savedSecurity) {
  const suffix = depot === "east" ? "_east" : "";
  const stored = {
    [`possessionLog_v2${suffix}`]: JSON.stringify(entries),
    [`scSecurityMessage_v1${suffix}`]: JSON.stringify(savedSecurity),
  };
  const { PossessionLog } = new Function("React", "icons", "PossessionEntryPicker", "PossessionAccessSearch", "localStorage", "base44", "buildPossessionCombinedOutput", "buildPossessionDashboard", "buildPossessionEntryOutput", "buildPossessionSecurityMessage", "getPossessionAccessDetails", "getPossessionEntryPendingStatus", "getPossessionSecurityDetails", "normalizePossessionAccessEntry", "removePossessionAccessEntry", `
    const { useState, useEffect, useRef, useMemo, useCallback } = React;
    const { FileText, Shield, Trash2, X, Plus, Copy, ClipboardCheck, Wind, Zap, UsersRound, Undo2, BarChart3, Clock3 } = icons;
    ${compiled}
    return { PossessionLog };
  `)(React, icons, PossessionEntryPicker, PossessionAccessSearch, { getItem: (key) => stored[key] || null }, {}, buildPossessionCombinedOutput, buildPossessionDashboard, buildPossessionEntryOutput,
    buildPossessionSecurityMessage, getPossessionAccessDetails, getPossessionEntryPendingStatus, getPossessionSecurityDetails, normalizePossessionAccessEntry, removePossessionAccessEntry);
  return renderToStaticMarkup(React.createElement(PossessionLog, { depot }));
}

for (const depot of ["west", "east"]) {
  test(`${depot} PSS provides its own access number search button`, () => {
    const html = renderDepot(depot, [entry], manual);
    assert.match(html, /class="req-mobile-only pss-access-search"/);
    assert.match(html, new RegExp(`aria-label="Search ${depot === "west" ? "West" : "East"} Depot access number"`));
  });

  test(`${depot} PIC dropdown distinguishes issue and handback waiting statuses`, () => {
    const entries = [
      { picName: "Pending PIC", accessNo: "1 / 2", issueTime: "1:00 PM", scd: "No" },
      { picName: "Returned PIC", accessNo: "3", issueTime: "13:00", handbackTime: "14:00" },
      { picName: "Draft PIC", accessNo: "4" },
    ];
    const options = (records) => {
      const nativePicker = renderDepot(depot, records, manual).match(/<label class="pss-native-entry-picker"[\s\S]*?<\/label>/)[0];
      return [...nativePicker.matchAll(/<option\b[^>]*>([^<]*)<\/option>/g)].map((match) => match[1]);
    };
    assert.deepEqual(options(entries), [
      "Entry 1 · Pending PIC — Waiting for handback",
      "Entry 2 · Returned PIC",
      "Entry 3 · Draft PIC — Waiting for issue",
    ]);
    const returned = [{ ...entries[0], handbackTime: "14:00" }, ...entries.slice(1)];
    assert.deepEqual(options(returned), ["Entry 1 · Pending PIC", "Entry 2 · Returned PIC", "Entry 3 · Draft PIC — Waiting for issue"]);
    assert.equal(entries[0].handbackTime, undefined);
  });

  test(`${depot} desktop selection progresses from cyan issue to amber SCD and violet handback, then clears`, () => {
    const pending = { picName: "Pending PIC", accessNo: "1", issueTime: "13:00" };
    const trigger = (records) => renderDepot(depot, records, manual).split('class="pss-entry-picker-trigger"')[1].split("</button>")[0];
    assert.match(trigger([{ ...pending, issueTime: "" }]), /data-status="issue"[\s\S]*Waiting for issue/);
    assert.match(trigger([pending]), /data-status="scd"[\s\S]*Waiting for SCD applied/);
    assert.match(trigger([{ ...pending, scdApplyTime: "13:05" }]), /data-status="handback"[\s\S]*Waiting for handback/);
    assert.match(trigger([{ ...pending, scd: "No" }]), /data-status="handback"[\s\S]*Waiting for handback/);
    assert.doesNotMatch(trigger([{ ...pending, handbackTime: "14:00" }]), /pss-handback-pill/);
    assert.match(trigger([{ picName: "Draft PIC", accessNo: "1" }]), /data-status="issue"[\s\S]*Waiting for issue/);
    assert.doesNotMatch(trigger([{ picName: "Draft PIC" }]), /pss-handback-pill/);
  });

  test(`${depot} desktop dashboard shows PICs waiting for handback`, () => {
    const html = renderDepot(depot, [
      { picName: "Waiting PIC", accessNo: "1 / 2", issueTime: "13:00" },
      { picName: "Returned PIC", accessNo: "3", issueTime: "13:00", handbackTime: "14:00" },
      { picName: "Draft PIC", accessNo: "4" },
    ], manual);
    assert.match(html, /class="req-mobile-only is-waiting-handback"[\s\S]*?PICs waiting<\/dt><dd>1<\/dd><span>for handback<\/span>/);
  });

  test(`${depot} combined output separates PICs but keeps entry and security outputs unchanged`, () => {
    const html = renderDepot(depot, [entry, {}, { picName: "Second PIC", accessNo: "777", description: "Second work" }], manual);
    const combined = html.split('pss-all-log-output')[1].split("</pre>")[0];
    assert.match(combined, /PIC - Jay Bigcas[\s\S]*?─{36}[\s\S]*?PIC - Second PIC/);
    assert.equal((combined.match(/─{36}/g) || []).length, 1);
    assert.doesNotMatch(html.split('pss-entry-log-output')[1].split("</pre>")[0], /─{36}/);
    assert.doesNotMatch(html.split("data-possession-security-output").slice(1).join(""), /─{36}/);
  });

  test(`${depot} actual PSS output gives every access entry its own security data and Copy button`, () => {
    const html = renderDepot(depot, [entry, { picName: "Second PIC", accessNo: "777", description: "Second work" }], manual);
    assert.match(html, /data-possession-outputs/);
    assert.match(html, /Add Access Number<\/button><p[^>]*>Use this when the same PIC has multiple access numbers\.<\/p>/);
    assert.match(html, /Add Another Access<\/button><p[^>]*>Use this for a different PIC name\.<\/p>/);
    assert.match(html, /Possession Log Output/);
    assert.match(html, /Copy Log/);
    assert.match(html, /Copy Security/);
    assert.match(html, /Auto-filled from Access Entry 1/);
    const security = html.split("data-possession-security-output").slice(1);
    assert.equal(security.length, 2);
    assert.match(security[0], /PIC Name: Jay Bigcas/);
    assert.match(security[0], /Access: 303004/);
    assert.doesNotMatch(security[0], /Second PIC|777|Second work/);
    assert.match(security[1], /Auto-filled from Access Entry 2/);
    assert.match(security[1], /PIC Name: Second PIC/);
    assert.match(security[1], /Access: 777/);
    assert.match(security[1], /Activity: Second work/);
    assert.doesNotMatch(security[1], /Jay Bigcas|303004|0501234567/);
    for (let i = 0; i < 2; i++) assert.match(security[i], new RegExp(`Copy Security for Access Entry ${i + 1}`));
  });
}

test("access search results show matching numbers and neon status, then choose the correct entry", () => {
  const chosen = [];
  const props = { query: "303", results: [
    { entryId: "first-pic", label: "Entry 1 · Jay", accessNumbers: ["303004", "303005"], waiting: true },
    { entryId: "second-pic", label: "Entry 2 · Sam", accessNumbers: ["303006"], waiting: false },
  ], onChoose: (entryId) => chosen.push(entryId) };
  const html = renderToStaticMarkup(React.createElement(PossessionAccessSearchResults, props));
  assert.match(html, /2 matching entries/);
  assert.match(html, /Access #303004 · Access #303005/);
  assert.equal((html.match(/pss-handback-pill/g) || []).length, 1);
  const scdHtml = renderToStaticMarkup(React.createElement(PossessionAccessSearchResults, { ...props, results: [{ ...props.results[0], waitingForScd: true }] }));
  assert.match(scdHtml, /data-status="scd"[\s\S]*Waiting for SCD applied/);
  const issueHtml = renderToStaticMarkup(React.createElement(PossessionAccessSearchResults, { ...props, results: [{ ...props.results[0], waitingForIssue: true }] }));
  assert.match(issueHtml, /data-status="issue"[\s\S]*Waiting for issue/);
  const buttons = [];
  const visit = (node) => {
    if (!React.isValidElement(node)) return;
    if (node.type === "button") buttons.push(node);
    React.Children.forEach(node.props.children, visit);
  };
  visit(PossessionAccessSearchResults(props));
  buttons[1].props.onClick();
  assert.deepEqual(chosen, ["second-pic"]);
  assert.match(renderToStaticMarkup(React.createElement(PossessionAccessSearchResults, { ...props, results: [] })), /No matching access number in this depot/);
});

test("both depot renderers keep independent saved phone, gate and location", () => {
  const west = renderDepot("west", [entry], manual);
  const east = renderDepot("east", [{ ...entry, picName: "East PIC" }], { phone: "0599876543", gateNo: "04", location: "East Depot" });
  assert.match(west, /Mobile#: 0501234567/);
  assert.doesNotMatch(west, /0599876543|East PIC/);
  assert.match(east, /PIC Name: East PIC/);
  assert.match(east, /Mobile#: 0599876543/);
  assert.doesNotMatch(east, /0501234567|PIC Name: Jay Bigcas/);
});

test("security form uses parent-controlled per-entry extras and stable entry keys", () => {
  const securitySource = source.slice(source.indexOf("function SCSecurityMessage("), source.indexOf("// ── Section 3: EPAF"));
  assert.doesNotMatch(securitySource, /onChange=\{set\("(?:picName|accessNo|description)"\)\}/);
  assert.match(securitySource, /generateSCOutput\(entry, form\)/);
  assert.match(securitySource, /onChange\(\{ phone: "", location: "", gateNo: "" \}\)/);
  assert.doesNotMatch(securitySource, /useState|usePossessionLiveState|localStorage/);
  const workspace = source.slice(source.indexOf("function PossessionDepotWorkspace("), source.indexOf("function PossessionTabContent("));
  assert.doesNotMatch(workspace, /<SCSecurityMessage/);
  assert.match(source, /<SCSecurityMessage key=\{entry\.entryId\} depot=\{depot\} entry=\{entry\} index=\{i\}/);
  assert.match(source, /onChange=\{\(securityDetails\) => updateEntry\(i, \{ \.\.\.entry, securityDetails \}\)\}/);
  assert.doesNotMatch(source, /entry=\{entries\[0\]\}/);
});

test("empty entry disables only its own security copy, not a filled later entry", () => {
  const html = renderDepot("west", [{}, entry], manual);
  const security = html.split("data-possession-security-output").slice(1);
  assert.match(security[0], /disabled=""[^>]*>[\s\S]*?Copy Security/);
  assert.match(security[0], /Fill in Access Entry 1 to generate the security message/);
  assert.doesNotMatch(security[0], /PIC Name: Jay Bigcas/);
  assert.doesNotMatch(security[1], /disabled=""/);
  assert.match(security[1], /PIC Name: Jay Bigcas/);
});

test("entry-owned security details survive normalize/save/reload and override legacy first-entry details", () => {
  const original = { ...entry, entryId: "second-pic", securityDetails: { phone: "0550000002", location: "TRACK 2", gateNo: "06" } };
  const saved = normalizePossessionAccessEntry(original);
  const reloaded = normalizePossessionAccessEntry(JSON.parse(JSON.stringify(saved)), 9);
  assert.equal(reloaded.entryId, "second-pic");
  assert.deepEqual(getPossessionSecurityDetails(reloaded, manual), original.securityDetails);
  assert.match(buildPossessionSecurityMessage(reloaded), /Mobile#: 0550000002/);
  assert.match(buildPossessionSecurityMessage(reloaded), /Location: TRACK 2\nGate Number: 06/);
  assert.deepEqual(getPossessionSecurityDetails({ securityDetails: {} }, manual), { phone: "", location: "", gateNo: "" });
});

test("removing the first legacy entry cannot transfer its phone/location/gate to the next PIC", () => {
  const entries = [entry, { picName: "Second PIC", accessNo: "777", description: "Second work" }].map(normalizePossessionAccessEntry);
  const remaining = removePossessionAccessEntry(entries, 0, manual);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].entryId, entries[1].entryId);
  assert.equal(remaining[0].picName, "Second PIC");
  assert.deepEqual(getPossessionSecurityDetails(remaining[0], manual), { phone: "", location: "", gateNo: "" });
  const html = renderDepot("west", remaining, manual);
  assert.doesNotMatch(html, /0501234567/);
  assert.match(html, /PIC Name: Second PIC/);
});

test("removing a middle entry keeps other entries' own security details with stable identities", () => {
  const entries = [entry, { ...entry, picName: "Middle" }, { ...entry, picName: "Last", securityDetails: { phone: "0550000003", location: "TRACK 3", gateNo: "08" } }].map(normalizePossessionAccessEntry);
  const remaining = removePossessionAccessEntry(entries, 1, manual);
  assert.equal(remaining[0].entryId, entries[0].entryId);
  assert.equal(remaining[1].entryId, entries[2].entryId);
  assert.deepEqual(getPossessionSecurityDetails(remaining[0]), manual);
  assert.equal(getPossessionSecurityDetails(remaining[1]).phone, "0550000003");
});

for (const depot of ["west", "east"]) {
  test(`${depot} separate entry-owned manual fields do not leak between security messages`, () => {
    const html = renderDepot(depot, [
      { ...entry, securityDetails: { phone: "0550000001", location: "TRACK 1", gateNo: "01" } },
      { picName: "Second PIC", accessNo: "777", description: "Second work", securityDetails: { phone: "0550000002", location: "TRACK 2", gateNo: "02" } },
    ], manual);
    const security = html.split("data-possession-security-output").slice(1);
    assert.match(security[0], /Mobile#: 0550000001/);
    assert.match(security[0], /Location: TRACK 1\nGate Number: 01/);
    assert.doesNotMatch(security[0], /0550000002|TRACK 2|Second PIC/);
    assert.match(security[1], /Mobile#: 0550000002/);
    assert.match(security[1], /Location: TRACK 2\nGate Number: 02/);
    assert.doesNotMatch(security[1], /0550000001|TRACK 1|Jay Bigcas/);
  });
}

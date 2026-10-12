import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";
import ts from "typescript";
import {
  buildPossessionEntryOutput, buildPossessionSecurityMessage,
  getPossessionAccessDetails, normalizePossessionAccessEntry,
} from "../src/lib/possessionAccessLog.js";

const entry = { picName: "Jay Bigcas", accessDetails: [{ accessNo: "303,004", description: "Buffer stops inspection" }] };
const manual = { phone: "0501234567", location: "West Depot", gateNo: "03" };

test("security message gets the three shared fields from the access entry", () => {
  assert.equal(buildPossessionSecurityMessage(entry, manual), [
    "PIC Name: Jay Bigcas", "Mobile#: 0501234567", "Access: 303004",
    "Activity: Buffer stops inspection", "Location: West Depot", "Gate Number: 03",
  ].join("\n"));
});

test("stale separately saved PIC/access/activity can never override Access Entry 1", () => {
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

test("blank/cleared first entry cannot show stale optional or shared security data", () => {
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

function renderDepot(depot, entries, savedSecurity) {
  const suffix = depot === "east" ? "_east" : "";
  const stored = {
    [`possessionLog_v2${suffix}`]: JSON.stringify(entries),
    [`scSecurityMessage_v1${suffix}`]: JSON.stringify(savedSecurity),
  };
  const { PossessionLog } = new Function("React", "icons", "localStorage", "base44", "buildPossessionEntryOutput", "buildPossessionSecurityMessage", "getPossessionAccessDetails", "normalizePossessionAccessEntry", `
    const { useState, useEffect, useRef, useMemo, useCallback } = React;
    const { FileText, Shield, Trash2, X, Plus, Copy, ClipboardCheck, Wind, Zap } = icons;
    ${compiled}
    return { PossessionLog };
  `)(React, icons, { getItem: (key) => stored[key] || null }, {}, buildPossessionEntryOutput,
    buildPossessionSecurityMessage, getPossessionAccessDetails, normalizePossessionAccessEntry);
  return renderToStaticMarkup(React.createElement(PossessionLog, { depot }));
}

for (const depot of ["west", "east"]) {
  test(`${depot} actual PSS output contains separate log/security copy actions and only first entry's security data`, () => {
    const html = renderDepot(depot, [entry, { picName: "Second PIC", accessNo: "777", description: "Second work" }], manual);
    assert.match(html, /data-possession-outputs/);
    assert.match(html, /Possession Log Output/);
    assert.match(html, /Copy Log/);
    assert.match(html, /Copy Security/);
    assert.match(html, /Auto-filled from Access Entry 1/);
    const security = html.slice(html.indexOf("data-possession-security-output"));
    assert.match(security, /PIC Name: Jay Bigcas/);
    assert.match(security, /Access: 303004/);
    assert.doesNotMatch(security, /Second PIC|777|Second work/);
    assert.equal((html.match(/data-possession-security-output/g) || []).length, 1);
  });
}

test("both depot renderers keep independent saved phone, gate and location", () => {
  const west = renderDepot("west", [entry], manual);
  const east = renderDepot("east", [{ ...entry, picName: "East PIC" }], { phone: "0599876543", gateNo: "04", location: "East Depot" });
  assert.match(west, /Mobile#: 0501234567/);
  assert.doesNotMatch(west, /0599876543|East PIC/);
  assert.match(east, /PIC Name: East PIC/);
  assert.match(east, /Mobile#: 0599876543/);
  assert.doesNotMatch(east, /0501234567|PIC Name: Jay Bigcas/);
});

test("security form exposes only manual extras and is no longer a separate PSS section", () => {
  const securitySource = source.slice(source.indexOf("function SCSecurityMessage("), source.indexOf("// ── Section 3: EPAF"));
  assert.doesNotMatch(securitySource, /onChange=\{set\("(?:picName|accessNo|description)"\)\}/);
  assert.match(securitySource, /generateSCOutput\(entry, form\)/);
  assert.match(securitySource, /setForm\(\(previous\) => \(\{ \.\.\.previous, phone: "", location: "", gateNo: "" \}\)\)/);
  const workspace = source.slice(source.indexOf("function PossessionDepotWorkspace("), source.indexOf("function PossessionTabContent("));
  assert.doesNotMatch(workspace, /<SCSecurityMessage/);
  assert.match(source, /<SCSecurityMessage depot=\{depot\} entry=\{entries\[0\]\} \/>/);
});

test("empty first entry disables security copy even when other access entries contain data", () => {
  const html = renderDepot("west", [{}, entry], manual);
  const security = html.slice(html.indexOf("data-possession-security-output"));
  assert.match(security, /disabled=""[^>]*>[\s\S]*?Copy Security/);
  assert.match(security, /Fill in Access Entry 1 to generate the security message/);
  assert.doesNotMatch(security, /PIC Name: Jay Bigcas/);
});

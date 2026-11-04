import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import postcss from "postcss";
import manualArrival from "../build/manualArrivalTimePlugin.js";
import manualSr from "../build/manualUnplannedSrPlugin.js";
import automaticParking from "../build/automaticParkingPstPlugin.js";
import automaticExcel from "../build/automaticExcelCompletedByPlugin.js";
import automaticNextWash from "../build/automaticNextWashOperPlugin.js";
import manualNextWash from "../build/manualNextWashMaintPlugin.js";

const source = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/tp1MovementReqSlate.css", import.meta.url), "utf8");
const tree = postcss.parse(css);
const scope = '.theme-train-movement-page[data-movement-design="req-slate"]';
const movement = source.slice(source.indexOf("function TrainMovementContent()"), source.indexOf("function buildPSTExportLinesFromVisibleState("));
const production = [manualArrival, manualSr, automaticParking, automaticExcel, automaticNextWash, manualNextWash]
  .reduce((code, plugin) => plugin().transform(code, "/repo/src/pages/DepotStabling.jsx").code, source);
function rule(fragment) {
  let result;
  tree.walkRules((node) => { if (node.selector.endsWith(fragment)) result ||= node; });
  assert.ok(result, `Missing ${fragment} rule`);
  return Object.fromEntries(result.nodes.filter((node) => node.type === "decl").map(({ prop, value }) => [prop, value]));
}

test("the approved MOV design is imported and opted into only by TrainMovementContent", () => {
  assert.equal((source.match(/import "\.\.\/tp1MovementReqSlate\.css";/g) || []).length, 1);
  assert.equal((source.match(/data-movement-design="req-slate"/g) || []).length, 1);
  assert.match(movement, /className="theme-train-movement-page grid w-full gap-3 xl:grid-cols-2" data-movement-design="req-slate"/);
  tree.walkRules((node) => {
    for (const selector of node.selectors) assert.ok(selector.includes(scope), selector);
  });
  assert.doesNotMatch(css, /(?:^|\n)\s*(?:html|body|#root)\s*\{/);
  assert.doesNotMatch(css, /\.app-shell|theme-maintenance|theme-insertion|theme-pst|\.col-span-full/);
});

test("both areas share quiet REQ frames but keep their green and amber accents", () => {
  assert.equal(rule(".theme-tp1-movement-window")["border-radius"], "18px");
  assert.equal(rule(".theme-tp1-movement-window")["box-shadow"], "none");
  assert.equal(rule(".theme-tp1-movement-window")["--mode"], "#7edbb7");
  assert.equal(rule('.theme-tp1-movement-window[data-movement-mode="manual"]')["--mode"], "#edc480");
  assert.match(css, /--mov-bg: #0b2133;/);
  assert.match(css, /--mov-bg: #ffffff;/);
  assert.match(css, /--mov-text: #16334b;/);
  assert.equal(rule(".theme-tp1-flow-connector").display, "none");
  assert.equal(rule(".theme-tp1-flow-step")["box-shadow"], "none");
});

test("log spacing and control feedback stay readable without changing output content", () => {
  assert.equal(rule(".theme-tp1-movement-log-entry").padding, "14px 12px");
  assert.equal(rule(".theme-tp1-movement-log-entry pre")["line-height"], "1.65");
  assert.match(movement, /onClick=\{\(\) => clearTp1MovementLogs\(movementType\)\}\s+data-confirm-clear=\{isTp1ConfirmingClear\}/);
  assert.equal(rule('button[data-confirm-clear="true"]').background, "#793044");
  for (const handler of ["copyTp1MovementPreview(movementType)", "addTp1MovementLog(movementType)", "copyTp1MovementLogs(movementType)", "handleDownloadTp1AutomaticExcel", "removeTp1MovementLog(entry.id)"]) {
    assert.ok(movement.includes(handler), handler);
  }
  assert.match(movement, /<MaspoTrainMovementChecker \/>/);
  assert.match(movement, /sortTp1MovementTextLinesByTime\(entry.text\)/);
});

test("the production transforms retain all seven/eight-step fields, actions and timing helpers", () => {
  assert.match(production, /data-movement-design="req-slate"/);
  assert.match(production, /Next Wash \(update status to OPER\)/);
  assert.match(production, /Next Wash \(update status to MAINT\)/);
  assert.match(production, /Get CMMS Number/);
  assert.match(production, /Auto-adds 10 min after arrival at TP1\. You can edit any timing\./);
  assert.match(production, /data-confirm-clear=\{isTp1ConfirmingClear\}/);
});

test("phone controls preserve 16px inputs, touch targets, keyboard focus and view switching", () => {
  assert.match(css, /@media \(max-width: 767px\)/);
  assert.match(css, /height: 44px; min-height: 44px;/);
  assert.match(css, /font-size: 16px !important;/);
  assert.match(css, /min-height: 36px;/);
  assert.match(css, /:focus-visible \{ outline:none!important; outline-offset:0;/);
  assert.match(css, /:focus-within,[\s\S]*:focus-visible \{ border-color:#5794bc!important;/);
  assert.match(css, /@media \(min-width: 1000px\)/);
  const hidden = [];
  tree.walkDecls("display", (node) => { if (node.value === "none") hidden.push(node.parent.selector); });
  assert.equal(hidden.length, 1);
  assert.ok(hidden[0].endsWith(".theme-tp1-flow-connector"));
});

test("selecting a MOV field highlights its existing edge without an inner outline or layout change", () => {
  const inner = rule(".theme-tp1-flow-step :is(input,select):focus-visible");
  assert.equal(inner.outline, "none");
  assert.equal(inner["outline-offset"], "0");
  let outer;
  tree.walkRules((node) => {
    if (node.selector.includes(".theme-tp1-inline-field:focus-within")) outer = node;
  });
  assert.ok(outer);
  assert.ok(outer.selectors.some((selector) => selector.includes(".theme-tp1-flow-step> :is(input,select):focus-visible")));
  assert.ok(outer.selectors.some((selector) => selector.includes(".theme-tp1-next-wash-content>div>input:focus-visible")));
  assert.deepEqual(outer.nodes.filter((node) => node.type === "decl").map(({ prop, value, important }) => [prop, value, important]), [["border-color", "#5794bc", true]]);
  assert.doesNotMatch(outer.selector, /button|textarea|maspo/);
});

test("night-mode completion ticks are brighter green without changing geometry or light-mode styling", () => {
  let bright;
  tree.walkRules((node) => {
    if (node.selector.includes('html[data-app-theme="dark"]') && node.selector.includes(".theme-tp1-step-check")) bright = node;
  });
  assert.ok(bright);
  assert.equal(bright.selectors.length, 2);
  assert.ok(bright.selectors.every((selector) => selector.includes(scope)));
  assert.deepEqual(bright.nodes.filter((node) => node.type === "decl").map(({ prop, value, important }) => [prop, value, important]), [["color", "#4dff88", true]]);
  assert.equal(rule(".theme-tp1-step-check").width, "14px");
  assert.equal(rule(".theme-tp1-step-check").height, "14px");
  assert.equal(rule(".theme-tp1-step-check").background, "var(--mode-bg)");
  assert.equal(rule(".theme-tp1-step-check svg").width, "11px");
  assert.equal(rule(".theme-tp1-step-check svg").color, "var(--mode)");
  assert.doesNotMatch(bright.selector, /copy|button|light/);
});

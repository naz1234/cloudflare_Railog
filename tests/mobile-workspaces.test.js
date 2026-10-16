import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import postcss from "postcss";
import { transformWithEsbuild } from "vite";
import React from "react";
import * as icons from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";

test("other mobile workspaces cannot change any laptop styles", () => {
  const css = ["mobileWorkspaces.css", "mobileActions.css", "mobileDensity.css"]
    .map((file) => readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"))
    .join("\n");
  const stylesheet = postcss.parse(css);
  let count = 0;
  stylesheet.walkRules((rule) => {
    count++;
    assert.equal(rule.parent.type, "atrule", `Unscoped rule: ${rule.selector}`);
    assert.equal(rule.parent.name, "media");
    assert.equal(rule.parent.params, "(max-width: 767px)");
    rule.selectors.forEach((selector) => assert.ok(selector.includes(".app-shell"), selector));
  });
  assert.ok(count > 0);
});

test("PST, Insertion and Sleep use the same road-list geometry as Train Request", () => {
  const request = postcss.parse(readFileSync(new URL("../src/reqMobileStabling.css", import.meta.url), "utf8"));
  const workspaces = postcss.parse(readFileSync(new URL("../src/mobileWorkspaces.css", import.meta.url), "utf8"));
  const declaration = (sheet, selector, property) => {
    let value;
    sheet.walkRules((rule) => {
      if (!selector(rule.selector)) return;
      rule.walkDecls(property, (decl) => { value = decl.value.replace(/\s+/g, ""); });
    });
    assert.notEqual(value, undefined, property);
    return value;
  };
  const requestCard = (selector) => selector.endsWith(" .theme-stabling-train-card");
  const prepInsertionCard = (selector) => selector.endsWith(":is(.theme-pst-card,.theme-insertion-card)");
  const sleepCard = (selector) => selector.endsWith(" .slp-stabling-train-card");
  for (const property of ["grid-template-columns", "min-height"]) {
    const expected = declaration(request, requestCard, property);
    assert.equal(declaration(workspaces, prepInsertionCard, property), expected);
    assert.equal(declaration(workspaces, sleepCard, property), expected);
  }
  const requestNumber = (selector) => selector.endsWith(" .theme-stabling-train-id");
  const sharedNumber = (selector) => selector.endsWith(".mobile-sleep-empty-number)");
  for (const property of ["width", "height", "border-radius"]) {
    assert.equal(declaration(workspaces, sharedNumber, property), declaration(request, requestNumber, property));
  }
});

const require = createRequire(import.meta.url);
const componentModule = { exports: {} };
const source = readFileSync(new URL("../src/components/ReqMobileNavigation.jsx", import.meta.url), "utf8");
const compiled = (await transformWithEsbuild(source, "ReqMobileNavigation.jsx", { loader: "jsx", format: "cjs", jsx: "automatic" })).code;
new Function("require", "module", "exports", compiled)((name) => name === "lucide-react" ? icons : require(name), componentModule, componentModule.exports);
const Navigation = componentModule.exports.default;

for (const [page, title, activeView, expectedTabs] of [
  ["movement", "Train Movement", "automatic", ["Automatic", "Manual", "Checker"]],
  ["pst", "Train Preparation", "trains", ["Trains", "Logs", "Excel / Remarks"]],
  ["insertion", "Insertion", "trains", ["Trains", "Timetable", "Logs", "Requests"]],
  ["washing", "Washing", "import", ["Excel import", "Manual wash", "Report"]],
  ["possession", "Possession", "access", ["Access", "EPAF", "Sweeping"]],
  ["roster", "Roster", "roster", ["Daily roster", "Staff schedule"]],
  ["sleep", "Sleep Mode", "trains", ["Select trains", "Logs / Excel"]],
]) {
  test(`${title} exposes its own phone navigation without REQ-only controls`, () => {
    const markup = renderToStaticMarkup(React.createElement(Navigation, {
      activePage: page, workspaceView: activeView, panel: "stabling", depot: "west",
      depotCounts: { west: 24, east: 14 }, theme: "dark",
    }));
    assert.ok(markup.includes(`${title} sections`));
    expectedTabs.forEach((tab) => assert.ok(markup.includes(`<span>${tab}</span>`), tab));
    assert.ok(!markup.includes('aria-label="Train Request sections"'));
    assert.ok(!markup.includes('aria-label="Log sections"'));
    const needsDepot = ["pst", "insertion", "sleep"].includes(page);
    assert.equal(markup.includes('aria-label="Choose stabling depot"'), needsDepot);
    assert.match(markup, /aria-pressed="true"/);
  });
}

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
  const css = ["mobileWorkspaces.css", "mobileActions.css", "mobileDensity.css", "possessionMobile.css"]
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

test("the PSS desktop preview cannot alter mobile or other desktop workspaces", () => {
  const css = readFileSync(new URL("../src/possessionDesktop.css", import.meta.url), "utf8");
  const stylesheet = postcss.parse(css);
  let count = 0;
  stylesheet.walkRules((rule) => {
    count++;
    assert.equal(rule.parent.name, "media");
    assert.equal(rule.parent.params, "(min-width: 768px)");
    rule.selectors.forEach((selector) => assert.ok(selector.includes('.app-shell[data-active-page="possession"]'), selector));
  });
  assert.ok(count > 0);
});

test("PSS desktop uses compact geometry without scaling or clipping form content", () => {
  const stylesheet = postcss.parse(readFileSync(new URL("../src/possessionDesktop.css", import.meta.url), "utf8"));
  const valueFor = (ending, property) => {
    let value;
    stylesheet.walkRules((rule) => {
      if (!rule.selector.endsWith(ending)) return;
      rule.walkDecls(property, (declaration) => { value = declaration.value; });
    });
    assert.notEqual(value, undefined, `${ending}: ${property}`);
    return value;
  };
  assert.equal(valueFor(" .pss-tab-workspace", "max-width"), "1120px");
  assert.equal(valueFor(" .pss-tab-workspace", "margin-inline"), "auto");
  assert.equal(valueFor(" .pss-dashboard > div", "padding"), "10px 12px");
  assert.equal(valueFor(" .pss-dashboard", "grid-template-columns"), "repeat(4,minmax(0,1fr))");
  assert.equal(valueFor(" .pss-dashboard dd", "font-size"), "24px");
  assert.equal(valueFor(" .pss-entry-picker-row select", "height"), "32px");
  assert.equal(valueFor(" input.theme-possession-input", "min-height"), "30px");
  assert.equal(valueFor(" .pss-access-detail", "grid-template-columns"), "minmax(88px,.85fr) minmax(0,2fr)");
  assert.equal(valueFor(" .pss-access-detail > .flex", "grid-column"), "1/-1");
  assert.equal(valueFor(" textarea.theme-possession-input", "resize"), "vertical");
  assert.equal(valueFor(" [data-possession-outputs] pre", "white-space"), "pre-wrap");
  stylesheet.walkDecls((declaration) => {
    // Floating options may scroll and the selected name may ellipsize. Forms
    // and output logs must still grow naturally without clipping or scaling.
    const selector = declaration.parent.selector || "";
    if ([" .pss-entry-popup", " .pss-entry-options", " .pss-entry-picker-value", " .pss-access-search-popup", " .pss-access-search-results"].some((ending) => selector.endsWith(ending))) return;
    assert.ok(!["zoom", "transform", "max-height"].includes(declaration.prop), declaration.toString());
    assert.ok(!["overflow", "overflow-y"].includes(declaration.prop) || declaration.value !== "hidden", declaration.toString());
  });
});

test("PSS neon picker keeps native mobile input and Radix keyboard selection", () => {
  const picker = readFileSync(new URL("../src/components/depot/PossessionEntryPicker.jsx", import.meta.url), "utf8");
  const css = postcss.parse(readFileSync(new URL("../src/possessionDesktop.css", import.meta.url), "utf8"));
  assert.match(picker, /from "@radix-ui\/react-select"/);
  assert.match(picker, /className="req-mobile-only pss-desktop-entry-picker"/);
  assert.match(picker, /className="pss-native-entry-picker" htmlFor=\{nativeId\}/);
  assert.match(picker, /<select id=\{nativeId\} aria-label=\{ariaLabel\}/);
  assert.match(picker, /<Select\.Portal container=\{portalContainer\}/);
  assert.match(picker, /window\.matchMedia\("\(min-width: 768px\)"\)/);
  assert.match(picker, /if \(!desktop\.matches\) setOpen\(false\)/);
  assert.match(picker, /<Select\.Root[\s\S]*?onValueChange=\{\(nextValue\) => \{ onValueChange\(nextValue\); setOpen\(false\); \}\}/);
  assert.match(picker, /<HandbackStatusPill waiting=\{selected\?\.waiting\}/);
  assert.match(picker, /<HandbackStatusPill waiting=\{option\.waiting\}/);
  assert.match(picker, /aria-describedby=\{selected\?\.waiting \? selectedStatusId : undefined\}/);
  let desktopNativeHidden = false;
  let neonGlow = false;
  css.walkRules((rule) => {
    if (rule.selector.endsWith(" .pss-native-entry-picker")) rule.walkDecls("display", (decl) => { desktopNativeHidden = decl.value === "none"; });
    if (rule.selector.endsWith(" .pss-handback-pill")) rule.walkDecls("box-shadow", () => { neonGlow = true; });
  });
  assert.equal(desktopNativeHidden, true);
  assert.equal(neonGlow, true);
});

test("PSS access search is desktop-only, focuses its input and opens the selected PIC form", () => {
  const search = readFileSync(new URL("../src/components/depot/PossessionAccessSearch.jsx", import.meta.url), "utf8");
  const source = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");
  assert.match(search, /className="req-mobile-only pss-access-search"/);
  assert.match(search, /className="req-mobile-only pss-access-search-popup"/);
  assert.match(search, /<Popover\.Portal container=\{portalContainer\}/);
  assert.match(search, /inputRef\.current\?\.focus\(\)/);
  assert.match(search, /if \(results\.length === 1\) choose\(results\[0\]\.entryId\)/);
  assert.match(search, /onValueChange\(entryId\); setOpen\(false\); setQuery\(""\)/);
  assert.match(source, /<PossessionAccessSearch entries=\{entries\} options=\{entryOptions\} depotLabel=\{getPossessionDepotLabel\(depot\)\}[\s\S]*?onValueChange=\{\(entryId\) => \{ setMobileEntryId\(entryId\); setMobileAccessView\("details"\); \}\}/);
});

test("PSS reference header decorations are desktop-only and reuse the existing controls", () => {
  const source = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");
  const baseCss = postcss.parse(readFileSync(new URL("../src/reqMobile.css", import.meta.url), "utf8"));
  let hiddenByDefault = false;
  baseCss.walkRules((rule) => {
    if (rule.selector !== ".req-mobile-only" || rule.parent.type !== "root") return;
    rule.walkDecls("display", (declaration) => { hiddenByDefault = declaration.value === "none"; });
  });
  assert.equal(hiddenByDefault, true);
  for (const icon of ["pss-stat-icon", "pss-controls-icon", "pss-depot-tab-icon"]) {
    const instances = [...source.matchAll(new RegExp(`className="([^"]*\\b${icon}\\b[^"]*)"`, "g"))];
    assert.ok(instances.length > 0, icon);
    instances.forEach((instance) => assert.ok(instance[1].split(/\s+/).includes("req-mobile-only"), icon));
  }
  assert.match(source, /className="req-mobile-only pss-desktop-view-switch"/);
  assert.match(source, /className="req-mobile-only is-waiting-handback"/);
  assert.match(source, /const TabIcon = depot === "epaf" \? Layers : TrainFront/);
  assert.match(source, /\["entry", "Entry log", FileText\], \["security", "Security", Shield\], \["all", "All logs", BarChart3\]/);
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

function pstPhoneDeclarations(suffix) {
  const stylesheet = postcss.parse(readFileSync(new URL("../src/mobileDensity.css", import.meta.url), "utf8"));
  let result;
  stylesheet.walkRules((rule) => {
    if (!rule.selector.includes('[data-active-page="pst"]') || !rule.selector.endsWith(suffix)) return;
    assert.equal(rule.parent.params, "(max-width: 767px)");
    assert.ok(rule.selector.includes("#root"));
    result = Object.fromEntries(rule.nodes.filter(node => node.type === "decl").map(({ prop, value }) => [prop, value]));
  });
  assert.ok(result, `Missing PST-only phone rule: ${suffix}`);
  return result;
}

test("PST phone cards put block, train and PST status together in a compact header", () => {
  const cell = pstPhoneDeclarations(" .theme-pst-grid-cell");
  assert.equal(cell.display, "block");
  assert.equal(pstPhoneDeclarations(" .theme-pst-grid-cell::before").display, "none");
  const card = pstPhoneDeclarations(" .theme-pst-card");
  assert.equal(card["grid-template-columns"], "36px minmax(0,1fr) 100px");
  assert.equal(card["min-width"], "0");
  assert.equal(card.background, "var(--req-mobile-panel)");
  assert.equal(card["border-left"], "3px solid var(--pst-mobile-accent)");
  const label = pstPhoneDeclarations(" .theme-pst-card > .theme-pst-mobile-block");
  assert.equal(label["grid-column"], "2");
  assert.equal(label["grid-row"], "1");
  assert.equal(label["white-space"], "nowrap");
  assert.equal(pstPhoneDeclarations(" .theme-pst-action-button")["grid-row"], "1");
  assert.equal(pstPhoneDeclarations(" .theme-pst-card.is-pst-done")["--pst-mobile-accent"], "#34b98c");
  assert.equal(pstPhoneDeclarations(" .theme-pst-card.is-pst-confirming")["--pst-mobile-accent"], "#e5ac45");
  assert.equal(pstPhoneDeclarations(" .theme-pst-card.is-prep-done")["--pst-mobile-accent"], "#60a5fa");
});

test("PST phone time fields use a simple inline row with TA beside the Prep action", () => {
  const timePanel = pstPhoneDeclarations(" .theme-pst-time-panel");
  assert.equal(timePanel["grid-column"], "1 / -1");
  assert.equal(timePanel.background, "transparent");
  assert.equal(timePanel.border, "0");
  const timeGroup = pstPhoneDeclarations(" .theme-pst-time-panel > div");
  assert.equal(timeGroup.flex, "1 1 0");
  assert.equal(timeGroup["min-width"], "0");
  const timeInput = pstPhoneDeclarations(" .theme-pst-card .theme-pst-time-input");
  assert.equal(timeInput.width, "68px");
  assert.equal(timeInput["min-height"], "36px");
  assert.equal(pstPhoneDeclarations(" .theme-pst-card > .theme-pst-controls").display, "contents");
  const ta = pstPhoneDeclarations(" .theme-pst-ta-input");
  const prep = pstPhoneDeclarations(" .theme-pst-prep-button");
  const completion = pstPhoneDeclarations(" .theme-pst-prep-panel");
  assert.equal(ta["grid-column"], "1 / span 2");
  assert.equal(prep["grid-column"], "3");
  assert.equal(ta["grid-row"], prep["grid-row"]);
  assert.equal(completion["grid-row"], prep["grid-row"]);
  assert.equal(completion["grid-column"], ta["grid-column"]);
  const idle = pstPhoneDeclarations(":is(.theme-pst-action-button,.theme-pst-prep-button).is-idle");
  assert.equal(idle.color, "var(--req-mobile-text)");
  const placeholder = pstPhoneDeclarations(" .theme-pst-ta-input::placeholder");
  assert.equal(placeholder.color, "var(--req-mobile-muted)");
  assert.equal(placeholder.opacity, "1");
});

test("PST phone clear tooltips are anchored inward so hidden bubbles do not widen the page", () => {
  const first = pstPhoneDeclarations(" .mobile-clear-actions > .removal-summary-tooltip-trigger > span");
  assert.equal(first.left, "0");
  assert.equal(first.transform, "none");
  assert.equal(first["max-width"], "min(280px,calc(100vw - 40px))");
  const second = pstPhoneDeclarations(" .mobile-clear-actions > .removal-summary-tooltip-trigger:nth-child(2) > span");
  assert.equal(second.left, "auto");
  assert.equal(second.right, "0");
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
  ["possession", "Possession", "access", ["Access", "Sweeping"]],
  ["roster", "Roster", "roster", ["Daily roster", "Staff schedule"]],
  ["sleep", "Sleep Mode", "trains", ["Select trains", "Logs / Excel"]],
]) {
  test(`${title} exposes its own phone navigation without REQ-only controls`, () => {
    const markup = renderToStaticMarkup(React.createElement(Navigation, {
      activePage: page, workspaceView: activeView, panel: "stabling", depot: "west",
      protectedPagesUnlocked: ["washing", "roster"].includes(page),
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

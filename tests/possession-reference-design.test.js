import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import postcss from "postcss";

const source = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");
const skin = postcss.parse(readFileSync(new URL("../src/possessionReference.css", import.meta.url), "utf8"));
const declarationsFor = (ending) => {
  const declarations = {};
  skin.walkRules((rule) => {
    if (!rule.selector.endsWith(ending)) return;
    rule.walkDecls((declaration) => { declarations[declaration.prop] = declaration.value; });
  });
  return declarations;
};

test("the slate palette is scoped to desktop PSS in both themes, never mobile or other pages", () => {
  let count = 0;
  skin.walkRules((rule) => {
    count++;
    assert.equal(rule.parent.name, "media");
    assert.match(rule.parent.params, /^\(min-width: 768px\)/);
    for (const selector of rule.selectors) {
      assert.match(selector, /^html\[data-app-theme(?:="light")?\] #root \.app-shell\[data-active-page="possession"\]/);
      assert.doesNotMatch(selector, /data-possession-depot=/, "Both depots share the reference skin");
    }
  });
  assert.ok(count > 50);
  assert.ok(source.indexOf('import "../possessionReference.css"') > source.indexOf('import "../possessionDesktop.css"'));
});

test("PSS uses the exact REQ panel, control, line and text palette in both themes", () => {
  const req = postcss.parse(readFileSync(new URL("../src/stablingSlate.css", import.meta.url), "utf8"));
  for (const theme of ["", '="light"']) {
    const selector = `html[data-app-theme${theme}]`;
    const palette = declarationsFor(`${selector} #root .app-shell[data-active-page="possession"]`);
    const reqPalette = {};
    req.walkRules((rule) => {
      if (rule.selector !== `${selector} .theme-stabling-section[data-stabling-design="compact-slate"]`) return;
      rule.walkDecls((decl) => { reqPalette[decl.prop] = decl.value; });
    });
    for (const key of ["panel", "control", "line", "text", "muted"]) {
      assert.equal(palette[`--pss-review-${key}`], reqPalette[`--stabling-${key}`], `${theme} ${key}`);
    }
  }
  assert.equal(declarationsFor(" .pss-dashboard > div")["border-color"], "var(--pss-review-line)");
  assert.equal(declarationsFor(" .pss-dashboard > div").background, "var(--pss-review-panel)");
  assert.equal(declarationsFor(' .pss-desktop-view-switch button[aria-pressed="true"]').background, "var(--pss-slate-active)");
  assert.equal(declarationsFor(' [aria-label="PSS sections"] button[aria-selected="true"]')["box-shadow"], "none");
});

test("multiple-access helper is white in dark mode and readable in light mode", () => {
  assert.equal(declarationsFor('html[data-app-theme] #root .app-shell[data-active-page="possession"]')["--pss-access-help-text"], "#ffffff");
  assert.equal(declarationsFor('html[data-app-theme="light"] #root .app-shell[data-active-page="possession"]')["--pss-access-help-text"], "#4e7198");
  assert.equal(declarationsFor(" .pss-add-access-number > p").color, "var(--pss-access-help-text)");
});

test("forms and outputs share rounded slate frames independently of PIC index", () => {
  assert.equal(declarationsFor(" .pss-access-form-panel").border, "0");
  assert.equal(declarationsFor(" .pss-access-form-panel > .p-4").padding, "0");
  const frames = declarationsFor(" :is(.theme-possession-card,.theme-possession-access-entry)");
  assert.equal(frames.border, "1px solid var(--pss-review-line)");
  assert.equal(frames.background, "var(--pss-review-panel)");
  assert.equal(frames["border-radius"], "28px");
  assert.equal(declarationsFor(" .pss-access-number-field")["grid-column"], "1");
  assert.equal(declarationsFor(" .pss-access-description-field")["grid-column"], "2");
  assert.equal(declarationsFor(" .theme-possession-card pre")["font-size"], "11px");
  // Do not override the working cyan/amber/violet status pills or green copy feedback.
  skin.walkRules((rule) => {
    assert.doesNotMatch(rule.selector, /pss-handback-pill/);
    if (rule.selector.includes(".pss-copy-action") && !rule.selector.endsWith(" svg")) {
      assert.ok(rule.selector.includes(':not([data-copy-state="copied"])'), rule.selector);
    }
  });
});

test("reference decorations are hidden by default, while access inputs retain their accessible names", () => {
  for (const name of ["section", "entry", "output"]) {
    assert.match(source, new RegExp(`className="req-mobile-only pss-reference-${name}-icon" aria-hidden="true"`));
  }
  const base = postcss.parse(readFileSync(new URL("../src/reqMobile.css", import.meta.url), "utf8"));
  let hidden = false;
  base.walkRules((rule) => {
    if (rule.selector !== ".req-mobile-only" || rule.parent.type !== "root") return;
    rule.walkDecls("display", (declaration) => { hidden = declaration.value === "none"; });
  });
  assert.equal(hidden, true);
  assert.match(source, /className="pss-access-number-field"[\s\S]*?ariaLabel=\{`Access number \$\{accessIndex \+ 1\} for entry \$\{index \+ 1\}`\}/);
  assert.match(source, /className="pss-access-description-field"[\s\S]*?ariaLabel=\{`Access description \$\{accessIndex \+ 1\} for entry \$\{index \+ 1\}`\}/);
  assert.match(source, /className="req-mobile-only pss-clear-all-inline"[\s\S]*?onClick=\{clear\}/);
});

test("the local design stays compact and reflows at narrow desktop widths without clipping forms", () => {
  const desktop = readFileSync(new URL("../src/possessionDesktop.css", import.meta.url), "utf8");
  assert.match(desktop, /\.pss-tab-workspace \{[^}]*max-width: 1120px/);
  let narrowReflow = false;
  skin.walkAtRules("media", (media) => {
    if (media.params !== "(min-width: 768px) and (max-width: 1023px)") return;
    media.walkRules((rule) => {
      if (!rule.selector.endsWith(" .pss-access-workspace")) return;
      rule.walkDecls("grid-template-columns", (decl) => { narrowReflow = decl.value === "minmax(0,1fr)"; });
    });
  });
  assert.equal(narrowReflow, true);
  skin.walkDecls((declaration) => {
    assert.ok(!["zoom", "transform", "max-height"].includes(declaration.prop), declaration.toString());
    assert.ok(!["overflow", "overflow-y"].includes(declaration.prop) || declaration.value !== "hidden", declaration.toString());
  });
});

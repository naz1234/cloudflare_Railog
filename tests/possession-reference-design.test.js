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

test("the reference palette is scoped to dark desktop PSS, never mobile, light mode or other pages", () => {
  let count = 0;
  skin.walkRules((rule) => {
    count++;
    assert.equal(rule.parent.name, "media");
    assert.match(rule.parent.params, /^\(min-width: 768px\)/);
    for (const selector of rule.selectors) {
      assert.ok(selector.startsWith('html[data-app-theme="dark"] #root .app-shell[data-active-page="possession"]'), selector);
      assert.doesNotMatch(selector, /data-possession-depot=/, "Both depots share the reference skin");
    }
  });
  assert.ok(count > 50);
  assert.ok(source.indexOf('import "../possessionReference.css"') > source.indexOf('import "../possessionDesktop.css"'));
});

test("dashboard counters and the teal toolbar use the supplied reference colours", () => {
  assert.equal(declarationsFor(" .pss-dashboard .is-issued")["--pss-stat-accent"], "#ffbd22");
  assert.equal(declarationsFor(" .pss-dashboard .is-pics")["--pss-stat-accent"], "#26baff");
  assert.equal(declarationsFor(" .pss-dashboard .is-handback")["--pss-stat-accent"], "#12dcb4");
  assert.equal(declarationsFor(" .pss-dashboard .is-waiting-handback")["--pss-stat-accent"], "#bb7aff");
  assert.equal(declarationsFor(" .pss-access-controls")["border-color"], "var(--pss-reference-teal)");
  assert.equal(declarationsFor(' .pss-desktop-view-switch button[aria-pressed="true"]').background, "linear-gradient(135deg, #00a5f0, #007ce7)");
});

test("the form has a single cyan frame and output panels use violet independently of PIC index", () => {
  assert.equal(declarationsFor(" .pss-access-form-panel").border, "0");
  assert.equal(declarationsFor(" .pss-access-form-panel > .p-4").padding, "0");
  assert.equal(declarationsFor(" .theme-possession-access-entry")["border-color"], "var(--pss-reference-cyan)");
  assert.equal(declarationsFor(" [data-possession-outputs] > .theme-possession-card")["border-color"], "var(--pss-reference-violet)");
  assert.equal(declarationsFor(" .pss-access-number-field")["grid-column"], "1");
  assert.equal(declarationsFor(" .pss-access-description-field")["grid-column"], "2");
  assert.equal(declarationsFor(" [data-possession-outputs] pre")["font-size"], "11px");
  // Do not override the working cyan/amber/violet status pills or green copy feedback.
  skin.walkRules((rule) => assert.doesNotMatch(rule.selector, /pss-handback-pill|data-copy-state/));
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

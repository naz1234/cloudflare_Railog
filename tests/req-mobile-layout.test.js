import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import postcss from "postcss";

test("REQ mobile styles cannot alter laptop layout or other application pages", () => {
  const styles = ["reqMobile.css", "reqMobileStabling.css", "reqMobileLogs.css"].map((file) => readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8")).join("\n");
  const stylesheet = postcss.parse(styles);
  let globalRules = 0;
  stylesheet.walkRules((rule) => {
    const media = rule.parent;
    if (media.type === "root") {
      globalRules += 1;
      assert.equal(rule.selector, ".req-mobile-only");
      assert.equal(rule.nodes.length, 1);
      assert.equal(rule.nodes[0].prop, "display");
      assert.equal(rule.nodes[0].value, "none");
      return;
    }
    assert.equal(media.type, "atrule");
    assert.equal(media.name, "media");
    assert.match(media.params, /^\(max-width: 767px\)(?: and \(prefers-reduced-motion: reduce\))?$/);
    for (const selector of rule.selectors) {
      assert.ok(
        selector.includes('.app-shell[data-active-page="stabling"]') || selector.trim().startsWith(".req-mobile-"),
        `Mobile rule must be REQ-scoped or target a new mobile-only control: ${selector}`,
      );
    }
  });
  assert.equal(globalRules, 1);
});

test("mobile stabling gives full block labels their own nonwrapping column after the shared density rule", () => {
  const stylesheet = postcss.parse(readFileSync(new URL("../src/mobileDensity.css", import.meta.url), "utf8"));
  const rules = [];
  stylesheet.walkRules((rule) => rules.push(rule));
  const shared = rules.findIndex((rule) => rule.selector.endsWith(":is(.theme-stabling-grid-cell,.theme-pst-grid-cell,.theme-insertion-grid-cell,.mobile-sleep-cell)"));
  const stabling = rules.findIndex((rule) => rule.selector.endsWith('.app-shell[data-active-page="stabling"] .theme-stabling-grid-cell'));
  assert.ok(shared >= 0 && stabling > shared);
  const declarations = (rule) => Object.fromEntries(rule.nodes.filter((node) => node.type === "decl").map(({ prop, value }) => [prop, value]));
  assert.equal(declarations(rules[stabling])["grid-template-columns"], "minmax(44px,max-content) minmax(0,1fr)");
  assert.equal(declarations(rules[stabling])["column-gap"], "8px");
  const label = rules.find((rule) => rule.selector.endsWith('.app-shell[data-active-page="stabling"] .theme-stabling-grid-cell::before'));
  assert.equal(declarations(label)["white-space"], "nowrap");
  for (const rule of [rules[stabling], label]) {
    assert.match(rule.selector, /#root .*data-active-page="stabling"/);
    assert.equal(rule.parent.params, "(max-width: 767px)");
  }
});

test("mobile stabling placeholders and long remarks wrap without widening their grid column", () => {
  const stylesheet = postcss.parse(readFileSync(new URL("../src/mobileDensity.css", import.meta.url), "utf8"));
  const declarationsFor = (suffix) => {
    let declarations;
    stylesheet.walkRules((rule) => {
      if (!rule.selector.endsWith(suffix)) return;
      assert.match(rule.selector, /data-active-page="stabling"/);
      declarations = Object.fromEntries(rule.nodes.filter((node) => node.type === "decl").map(({ prop, value }) => [prop, value]));
    });
    return declarations;
  };
  const text = declarationsFor(":is(.theme-stabling-train-card > span.block,.theme-stabling-remark)");
  assert.equal(text["white-space"], "normal");
  assert.equal(text["overflow-wrap"], "anywhere");
  assert.equal(text["min-width"], "0");
  assert.equal(declarationsFor('.app-shell[data-active-page="stabling"] .theme-stabling-train-card')["min-width"], "0");
  assert.equal(declarationsFor('.app-shell[data-active-page="stabling"] .theme-stabling-train-card > div.flex.w-full')["min-width"], "0");
});

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

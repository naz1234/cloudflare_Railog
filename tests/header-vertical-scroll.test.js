import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");
const start = source.indexOf("  const handleHeaderVerticalScroll = useCallback");
const end = source.indexOf("  const closeProtectedShortcutLogin", start);
const callback = source.slice(start, end);
const element = (height, viewport) => ({
  scrollHeight: height,
  clientHeight: viewport,
  calls: [],
  scrollTo(options) { this.calls.push(options); },
});
function handler(main, page, fallback = page) {
  assert.ok(start >= 0 && end > start);
  return vm.runInNewContext(`${callback}\nhandleHeaderVerticalScroll`, {
    useCallback: (fn) => fn,
    mainContentScrollRef: { current: main },
    document: { scrollingElement: page, documentElement: fallback },
  });
}
const calls = (target) => JSON.parse(JSON.stringify(target.calls));

test("Up and Down scroll an independently scrollable main panel without changing horizontal position", () => {
  const main = element(2400, 700);
  const page = element(3000, 900);
  const scroll = handler(main, page);
  scroll("up");
  scroll("down");
  assert.deepEqual(calls(main), [{ top: 0, behavior: "smooth" }, { top: 2400, behavior: "smooth" }]);
  assert.deepEqual(calls(page), []);
});

test("Up and Down use the page scrollbar when the main panel grows with its contents", () => {
  const main = element(2400, 2400);
  const page = element(3000, 900);
  const scroll = handler(main, page);
  scroll("up");
  scroll("down");
  assert.deepEqual(calls(main), []);
  assert.deepEqual(calls(page), [{ top: 0, behavior: "smooth" }, { top: 3000, behavior: "smooth" }]);
});

test("vertical controls fall back to documentElement when scrollingElement is unavailable", () => {
  const page = element(1200, 700);
  handler(null, null, page)("down");
  assert.deepEqual(calls(page), [{ top: 1200, behavior: "smooth" }]);
  assert.doesNotThrow(() => handler(null, null, null)("up"));
});

test("only Up and Down remain with the matching style and accessible labels", () => {
  for (const [direction, title] of [["up", "top"], ["down", "bottom"]]) {
    const button = Array.from(source.matchAll(/<button\b[^]*?<\/button>/g), (match) => match[0])
      .find((markup) => markup.includes(`onClick={() => handleHeaderVerticalScroll("${direction}")}`));
    assert.ok(button);
    assert.match(button, new RegExp(`aria-label="Go to ${title}"`));
    assert.match(button, /rounded-lg border border-\[#2b4f6b\] bg-\[#071828\]/);
    assert.match(button, /shadow-\[0_0_14px_rgba\(79,142,247,0\.18\)\]/);
  }
  assert.doesNotMatch(source, /handleHeaderHorizontalScroll/);
  assert.doesNotMatch(source, /Go to far (?:left|right)/);
});

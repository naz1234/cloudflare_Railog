import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import * as icons from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithEsbuild } from "vite";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/components/depot/MovementOutputDisclosure.jsx", import.meta.url), "utf8");
const compiled = (await transformWithEsbuild(source, "MovementOutputDisclosure.jsx", { loader: "jsx", format: "cjs", jsx: "automatic" })).code;
function loadComponent(react = React) {
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => name === "react" ? react : name === "lucide-react" ? icons : require(name), module, module.exports);
  return module.exports.default;
}

function controller() {
  const slots = [];
  let cursor = 0;
  const Component = loadComponent({
    useId: () => "movement-output-test",
    useRef(value) {
      const index = cursor++;
      if (slots[index] === undefined) slots[index] = { current: value };
      return slots[index];
    },
    useState(initial) {
      const index = cursor++;
      if (slots[index] === undefined) slots[index] = initial;
      return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
  });
  return {
    slots,
    render() {
      cursor = 0;
      const root = Component({ westCount: 2, eastCount: 1, children: "Existing output logs" });
      return { root: root.props, trigger: root.props.children[0].props, content: root.props.children[1].props };
    },
  };
}

test("movement output starts collapsed with an accessible toggle and preserves its log contents", () => {
  const Component = loadComponent();
  const html = renderToStaticMarkup(React.createElement(Component, { westCount: 2, eastCount: 1 },
    React.createElement("button", { type: "button" }, "Copy West Log"),
    React.createElement("pre", null, "Existing output logs"),
  ));
  assert.match(html, /aria-expanded="false"/);
  const contentId = html.match(/aria-controls="([^"]+)"/)[1];
  assert.ok(html.includes(`id="${contentId}" class="movement-output-content" hidden=""`));
  assert.match(html, /Output logs/);
  assert.match(html, /West <strong>2<\/strong>/);
  assert.match(html, /East <strong>1<\/strong>/);
  assert.match(html, /Copy West Log/);
  assert.match(html, /Existing output logs/);
});

test("mouse hover reveals output and leaving hides it without opening on touch hover", () => {
  const ui = controller();
  ui.render().root.onPointerEnter({ pointerType: "touch" });
  assert.equal(ui.render().content.hidden, true);
  ui.render().root.onPointerEnter({ pointerType: "mouse" });
  assert.equal(ui.render().trigger["aria-expanded"], true);
  assert.equal(ui.render().content.children, "Existing output logs");
  ui.render().root.onPointerLeave({ pointerType: "mouse" });
  assert.equal(ui.render().content.hidden, true);
});

test("click or tap toggles logs and focus leaving the disclosure releases the open state", () => {
  const ui = controller();
  ui.render().trigger.onClick();
  assert.equal(ui.render().content.hidden, false);
  ui.render().trigger.onClick();
  assert.equal(ui.render().content.hidden, true);
  ui.render().trigger.onClick();
  ui.render().root.onBlurCapture({ currentTarget: { contains: () => false }, relatedTarget: null });
  assert.equal(ui.render().content.hidden, true);
});

test("keyboard focus keeps logs available for copying and Escape closes them and restores focus", () => {
  const ui = controller();
  ui.render().root.onFocusCapture({ target: { matches: () => true } });
  assert.equal(ui.render().content.hidden, false);
  ui.render().root.onBlurCapture({ currentTarget: { contains: () => true }, relatedTarget: {} });
  assert.equal(ui.render().content.hidden, false);
  let focusCalls = 0;
  let cancelled = 0;
  ui.slots[0].current = { focus: () => { focusCalls++; } };
  ui.render().root.onKeyDown({ key: "Escape", preventDefault: () => { cancelled++; }, stopPropagation: () => {} });
  assert.equal(ui.render().content.hidden, true);
  assert.equal(focusCalls, 1);
  assert.equal(cancelled, 1);
});

test("only generated movement output is wrapped; existing depot cards, copy actions and other logs remain", () => {
  const page = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");
  assert.match(page, /<MovementOutputDisclosure westCount=\{westMovementLogRows.length\} eastCount=\{eastMovementLogRows.length\}>/);
  const contents = page.slice(page.indexOf("<MovementOutputDisclosure"), page.indexOf("</MovementOutputDisclosure>"));
  assert.match(contents, /rows: westMovementLogRows/);
  assert.match(contents, /rows: eastMovementLogRows/);
  assert.match(contents, /onClick=\{\(\) => copyExcelLogRows\(log.key\)\}/);
  assert.match(contents, /\{logText\}/);
  assert.doesNotMatch(contents, /theme-movement-sheet-table|RemovalLogOutputFromTrainRem/);
  assert.match(page, /<RemovalLogOutputFromTrainRem/);
  const css = readFileSync(new URL("../src/movementLogSlate.css", import.meta.url), "utf8");
  assert.match(css, /\.movement-output-content\[hidden\] \{ display: none !important; \}/);
});

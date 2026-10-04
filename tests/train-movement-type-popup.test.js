import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const componentUrl = new URL("../src/components/depot/TrainMovementTypeSelect.jsx", import.meta.url);
const componentSource = readFileSync(componentUrl, "utf8");
const pageSource = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
const optionsSource = componentSource.match(/export const MOVEMENT_TYPE_OPTIONS = (\[[\s\S]*?\]);/)[1];
const MOVEMENT_TYPE_OPTIONS = new Function(`return ${optionsSource};`)();

test("the popup keeps the exact existing swapping, insertion and removal icons", () => {
  assert.deepEqual(MOVEMENT_TYPE_OPTIONS, [
    { value: "swapping", label: "Swapping", icon: "⇄" },
    { value: "insertion", label: "Insertion", icon: "→" },
    { value: "removal", label: "Removal", icon: "←" },
  ]);
  for (const option of MOVEMENT_TYPE_OPTIONS) {
    assert.ok(styles.includes(`content: "${option.icon}";`));
  }
  assert.match(componentSource, /MOVEMENT_TYPE_OPTIONS\.map\(\(option\) =>/);
  assert.match(componentSource, /className="theme-movement-type-option-icon" aria-hidden="true">\s*<span className="theme-movement-type-option-symbol">\{option\.icon\}<\/span>/);
});

test("popup icons reuse the selected type's exact animation names and 2.8-second rhythm", () => {
  assert.match(styles, /\.theme-movement-type-option-symbol\s*\{[^}]*position: absolute;[^}]*top: 50%;[^}]*animation: movement-type-swap 2\.8s ease-in-out infinite;/);
  assert.match(styles, /\.theme-movement-type-option\[data-movement-type="insertion"\] \.theme-movement-type-option-symbol\s*\{\s*animation-name: movement-type-enter;/);
  assert.match(styles, /\.theme-movement-type-option\[data-movement-type="removal"\] \.theme-movement-type-option-symbol\s*\{\s*animation-name: movement-type-exit;/);
  assert.match(styles, /\.theme-movement-type-option-icon\s*\{[^}]*flex: 0 0 18px;[^}]*height: 18px;/);
  assert.match(styles, /html\[data-app-theme="light"\] \.theme-movement-type-option-symbol,[^]*?color: var\(--movement-option-accent\) !important;/);
});

test("popup motion is disabled for reduced-motion users without hiding or shifting icons", () => {
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.theme-movement-type-option-symbol\s*\{\s*animation: none !important;\s*transform: translateY\(-50%\);\s*opacity: 1;\s*will-change: auto;/);
});

test("popup icons have the same coloured 7px glow as the selected table icons", () => {
  const tableIconRule = styles.match(/\.theme-movement-sheet-table tbody td:nth-child\(2\)::before\s*\{([^}]*)\}/)[1];
  const popupIconRule = styles.match(/\.theme-movement-type-option-symbol\s*\{([^}]*)\}/)[1];
  const tableGlow = tableIconRule.match(/text-shadow:\s*([^;]+);/)[1];
  const popupGlow = popupIconRule.match(/text-shadow:\s*([^;]+);/)[1];
  assert.equal(popupGlow, tableGlow.replace("--movement-type-accent", "--movement-option-accent"));
  assert.equal(popupGlow, "0 0 7px var(--movement-option-accent)");
});

test("every selected type keeps its label and the trigger is an accessible select control", () => {
  const selectionSource = componentSource.match(/const selected = ([^;]+);/)[1];
  const selectOption = new Function("value", "MOVEMENT_TYPE_OPTIONS", `return ${selectionSource};`);
  for (const option of MOVEMENT_TYPE_OPTIONS) {
    assert.deepEqual(selectOption(option.value, MOVEMENT_TYPE_OPTIONS), option);
  }
  assert.deepEqual(selectOption("unknown", MOVEMENT_TYPE_OPTIONS), MOVEMENT_TYPE_OPTIONS[0]);
  assert.match(componentSource, /<SelectPrimitive\.Trigger[^]*?data-movement-type=\{selected\.value\}[^]*?aria-label="Movement type"/);
  assert.match(componentSource, /<SelectPrimitive\.Value>\{selected\.label\}<\/SelectPrimitive\.Value>/);
  assert.match(componentSource, /textValue=\{option\.label\}/);
});

test("type changes and open state use the existing row update and synchronization guards", () => {
  assert.match(componentSource, /<SelectPrimitive\.Root value=\{selected\.value\} onValueChange=\{onValueChange\} onOpenChange=\{onOpenChange\}/);
  assert.match(pageSource, /<TrainMovementTypeSelect\s+value=\{row\.operation\}\s+onValueChange=\{\(operation\) => updateRow\(row\.id, "operation", operation\)\}/);
  assert.match(pageSource, /onOpenChange=\{\(open\) => \{ trainMovementExcelTypeMenuOpenRef\.current = open; \}\}/);
  assert.match(pageSource, /isInputFocused: trainMovementExcelInputFocusedRef\.current \|\| trainMovementExcelTypeMenuOpenRef\.current/);
  assert.match(pageSource, /trainMovementExcelInputFocusedRef\.current \|\|\s+trainMovementExcelTypeMenuOpenRef\.current \|\|/);
});

test("the popup is portalled outside the table clipping and shows a selected checkmark", () => {
  assert.match(componentSource, /<SelectPrimitive\.Portal>/);
  assert.match(componentSource, /position="popper"\s+side="bottom"\s+align="start"\s+sideOffset=\{3\}\s+collisionPadding=\{8\}/);
  assert.match(componentSource, /<SelectPrimitive\.ItemIndicator[^]*?<Check size=\{14\}/);
});

test("new popup styles preserve table dimensions, type colors and the existing reduced-motion support", () => {
  assert.match(styles, /\.theme-movement-type-trigger\s*\{[^}]*height: 28px;/);
  assert.match(styles, /\.theme-movement-type-popup\s*\{[^}]*width: 180px;[^}]*border-radius: 9px;[^}]*background: #071d2e;/);
  assert.match(styles, /html\[data-app-theme="light"\] \.theme-movement-type-popup\s*\{[^}]*background: #ffffff;/);
  assert.match(styles, /html\[data-app-theme="light"\] \.theme-movement-type-option-icon,[^]*?\.theme-movement-type-option-check svg\s*\{\s*color: var\(--movement-option-accent\) !important;/);
  assert.match(styles, /theme-movement-type-trigger\[data-movement-type="insertion"\]\)::before\s*\{\s*content: "→";\s*animation-name: movement-type-enter;/);
  assert.match(styles, /theme-movement-type-trigger\[data-movement-type="removal"\]\)::before\s*\{\s*content: "←";\s*animation-name: movement-type-exit;/);
  assert.match(styles, /prefers-reduced-motion: reduce[^]*?td:nth-child\(2\)::before\s*\{\s*animation: none !important;/);
});

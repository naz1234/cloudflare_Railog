import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { FileText, Copy, Loader2, Check, Trash2, Download } from "lucide-react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { groupSleepModeLogs } from "../src/lib/sleepModeLog.js";
import { SLEEP_EXCEL_COPY_SHIFTS } from "../src/lib/sleepModeExcel.js";

const source = readFileSync(new URL("../src/components/SleepModeWorkspace.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/sleepLogSlate.css", import.meta.url), "utf8");
const windowCss = readFileSync(new URL("../src/outputWindowsSlate.css", import.meta.url), "utf8");
const start = source.indexOf("function SleepLogGroup(");
const components = source.slice(start, source.indexOf("export default function SleepModeWorkspace", start));
const compiled = ts.transpileModule(components, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  fileName: "SleepLogOutput.jsx",
}).outputText;
const { SleepLogOutputPanel } = new Function("React", "useMemo", "groupSleepModeLogs", "DEPOT_LAYOUTS", "SLEEP_EXCEL_COPY_SHIFTS", "FileText", "Copy", "Loader2", "Check", "Trash2", "Download", "Tooltip", "TooltipContent", "TooltipProvider", "TooltipTrigger", `${compiled}\nreturn { SleepLogOutputPanel };`)(
  React, (callback) => callback(), groupSleepModeLogs,
  { west: { label: "West Depot", shortLabel: "WD" }, east: { label: "East Depot", shortLabel: "ED" } },
  SLEEP_EXCEL_COPY_SHIFTS,
  FileText, Copy, Loader2, Check, Trash2, Download,
  TooltipPrimitive.Root, TooltipPrimitive.Content, TooltipPrimitive.Provider, TooltipPrimitive.Trigger,
);
const sample = (mode = "sleep", time = "19:23") => ({ id: `${mode}-${time}`, time, trainIds: ["29"], location: "WD-ST14", mode, createdAt: `2026-10-11T${time}:00Z` });
const render = (props = {}) => renderToStaticMarkup(React.createElement(SleepLogOutputPanel, {
  depot: "west", logs: [sample()], loaded: true, saving: false, confirmClear: false,
  onCopy() {}, onClear() {}, onDownload() {}, onDelete() {}, ...props,
}));

test("SLP uses one Removal Log-style window with stacked depot outputs", () => {
  assert.match(source, /import "\.\.\/outputWindowsSlate\.css"/);
  assert.match(source, /className="theme-sleep-log-window" data-window-design="compact-slate"/);
  assert.match(source, /<h2 className="slate-window-title">Sleep \/ Wake-up Log Output<\/h2>/);
  assert.match(source, /slate-window-body sleep-log-depot-list/);
  assert.match(windowCss, /html\[data-app-theme\] :is\([^\n]*\.theme-sleep-log-window\)/);
  assert.match(windowCss, /html\[data-app-theme="light"\] :is\([^\n]*\.theme-sleep-log-window\)/);
  assert.doesNotMatch(source.slice(source.indexOf('className="theme-sleep-log-window"')), /xl:grid-cols-2/);
});

test("SLP starts with depot panels without the top banner while automatic sync stays active", () => {
  assert.doesNotMatch(source, /SLP — Sleep Mode|Select trains from live stabling, then record|Refresh Sleep log from cloud|const refreshNow/);
  assert.match(source, /aria-label="Sleep Mode workspace">\s*<div className="grid gap-4 xl:grid-cols-2">/);
  assert.match(source, /<span className="sr-only" role="status">\{syncStatus\}<\/span>/);
  assert.match(source, /const SLEEP_MODE_POLL_MS = 5_000;/);
  assert.match(source, /window\.setInterval\(async \(\) =>/);
  assert.match(source, /await fetchLatest\(false\)/);
  assert.match(source, /<DepotSleepPanel depot="west"/);
  assert.match(source, /<DepotSleepPanel depot="east"/);
});

test("real Sleep output renders consecutive text lines without individual card frames", () => {
  const html = render({ logs: [sample(), sample("sleep", "19:24")] });
  assert.match(html, /West Depot Sleep \/ Wake-up Log/);
  assert.match(html, /2 entries/);
  assert.match(html, /<h4 class="sleep-log-mode-title">Sleep Mode<\/h4>/);
  assert.equal((html.match(/class="sleep-log-line-text"/g) || []).length, 2);
  assert.equal((html.match(/class="sleep-log-line"/g) || []).length, 2);
  assert.match(html, /19:23 hrs – T29 confirmed successfully in sleep mode at WD–ST14\./);
  assert.doesNotMatch(html, /data-sleep-log-mode="wake"|Wake-up Mode<\/h4>|rounded-xl|border-indigo|lucide-moon/);
  assert.match(css, /\.sleep-log-line-text \{[^}]*white-space: pre-wrap;[^}]*overflow-wrap: anywhere;/);
  assert.match(css, /\.sleep-log-line \{[^}]*display: grid;/);
});

test("each delete button sits immediately before the timing, not at the panel's far edge", () => {
  for (const mode of ["sleep", "wake"]) {
    const html = render({ logs: [sample(mode)] });
    const row = html.match(/<li class="sleep-log-line">([\s\S]*?)<\/li>/)?.[1];
    assert.ok(row);
    assert.ok(row.indexOf("sleep-log-line-delete") < row.indexOf("sleep-log-line-text"));
    assert.match(row, /<\/button><p class="sleep-log-line-text">19:23 hrs/);
  }
  assert.match(css, /\.sleep-log-line \{[^}]*grid-template-columns: 22px minmax\(0, 1fr\);[^}]*column-gap: 4px;/);
  const deleteRule = css.match(/\.sleep-log-line-delete \{([^}]*)\}/)?.[1];
  assert.doesNotMatch(deleteRule, /position: absolute|right:|left:/);
  assert.match(css, /\.sleep-log-line-text \{[^}]*min-width: 0;/);
  assert.match(source, /onClick=\{\(\) => onDelete\(entry.id\)\} disabled=\{saving\}/);
});

test("mixed modes retain their headings, chronological lines and remarks, but empty modes stay absent", () => {
  const html = render({ logs: [{ ...sample("wake", "22:10"), remark: "Ready for service" }, sample("sleep", "19:25"), sample("sleep", "18:25")] });
  assert.equal((html.match(/sleep-log-mode-title/g) || []).length, 2);
  assert.ok(html.indexOf("18:25 hrs") < html.indexOf("19:25 hrs"));
  assert.ok(html.indexOf("Sleep Mode</h4>") < html.indexOf("Wake-up Mode</h4>"));
  assert.match(html, /22:10 hrs – T29 successfully in wake-up mode at WD–ST14\./);
  assert.match(html, /– Ready for service/);
  assert.doesNotMatch(render({ logs: [sample("wake")] }), /data-sleep-log-mode="sleep"/);
});

test("toolbar preserves accessible actions and green success states, including disabled Cleared", () => {
  const copied = render({ copyStatus: "copied" });
  assert.match(copied, /slate-window-action slate-copy-feedback/);
  assert.match(copied, /data-copy-state="copied"/);
  assert.match(copied, /aria-live="polite">Copied<\/span>/);
  assert.match(copied, /Download Excel|Clear All/);
  assert.match(copied, /aria-label="Delete 19:23 hrs/);
  const cleared = render({ logs: [], clearStatus: "cleared" });
  assert.match(cleared, /disabled="" data-action-state="cleared"/);
  assert.match(cleared, /aria-live="polite">Cleared<\/span>/);
  assert.match(cleared, /No West Depot entries yet/);
  assert.doesNotMatch(cleared, /data-sleep-log-mode=/);
  assert.match(render({ confirmClear: true }), /Confirm WD/);
  assert.match(render({ depot: "east" }), /East Depot Sleep \/ Wake-up Log/);
});

test("compact text matches Removal's type scale and both theme surfaces; deletes stay keyboard/touch accessible", () => {
  assert.match(css, /--sleep-log-body: #071828;/);
  assert.match(css, /--sleep-log-body: #f6f8fb;/);
  assert.match(css, /--sleep-log-text: #d8e7f7;/);
  assert.match(css, /--sleep-log-text: #0f172a;/);
  assert.match(css, /font-size: 11px;\s*font-weight: 400;\s*line-height: 1\.4;/);
  assert.match(css, /:is\(:hover, :focus-within\) \.sleep-log-line-delete \{\s*opacity: 1;/);
  assert.match(css, /@media \(hover: none\)[\s\S]*opacity: 1;/);
  assert.match(css, /\.sleep-log-line-delete:focus-visible \{[^}]*outline:/);
});

test("both depot outputs expose all three exact Excel ranges with per-shift accessible feedback", () => {
  for (const depot of ["west", "east"]) {
    const label = depot === "west" ? "West Depot" : "East Depot";
    const html = render({ depot, excelCopyStatuses: {
      [`copy-excel-${depot}-night`]: "copied", [`copy-excel-${depot}-early`]: "pending", [`copy-excel-${depot}-late`]: "failed",
    } });
    for (const { label: shift, range } of SLEEP_EXCEL_COPY_SHIFTS) {
      assert.ok(html.includes(`aria-label="${label}: copy ${shift} Shift Excel (${range})"`));
      assert.ok(html.includes(`Paste into ${range}: 47 train rows, Date through Remarks`));
    }
    assert.match(html, /aria-live="polite">Night copied<\/span>/);
    assert.match(html, /disabled="" data-copy-state="pending" aria-busy="true"/);
    assert.match(html, /aria-live="polite">Copying Early\.\.\.<\/span>/);
    assert.match(html, /aria-live="polite">Late copy failed<\/span>/);
    for (const state of [{ loaded: false }, { logs: [] }]) {
      const empty = render({ depot, ...state });
      assert.equal((empty.match(/disabled="" data-copy-state="idle" aria-busy="false" aria-label="[^"]+Shift Excel/g) || []).length, 3);
    }
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as icons from 'lucide-react';
import ts from 'typescript';

const source = readFileSync(new URL('../src/components/PstExcelFormatLogPanel.jsx', import.meta.url), 'utf8');
const checklistSource = readFileSync(new URL('../src/components/PstFldcChecklist.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/pstExcelFormatLog.css', import.meta.url), 'utf8');
function compile(code) {
  return ts.transpileModule(code.replace(/^import .*;\r?\n/gm, '').replace('export default function', 'function'), {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}
const Checklist = new Function('React', 'Check', 'ShieldCheck', `${compile(checklistSource)}\nreturn PstFldcChecklist;`)(React, icons.Check, icons.ShieldCheck);
const Panel = new Function('React', 'ClipboardCheck', 'Copy', 'Download', 'FileSpreadsheet', 'PstFldcChecklist', `${compile(source)}\nreturn PstExcelFormatLogPanel;`)(React, icons.ClipboardCheck, icons.Copy, icons.Download, icons.FileSpreadsheet, Checklist);
function props(depot, overrides = {}) {
  return {
    depot, completedBy: `${depot.toUpperCase()} COMPLETED DC`, onCompletedByChange() {},
    fldcController: {
      drafts: { west: { by: 'WEST FLDC DC' }, east: { by: 'EAST FLDC DC' } },
      trainIds: { west: ['01', '02', '03'], east: ['46', '47'] },
      loaded: { west: true, east: true }, saving: {}, errors: {},
      isConfirmed: () => true, updateDraft() {}, confirm() {}, retry() {},
    },
    liveStatus: 'Synced 04:29', liveHealthy: true,
    downloadingDepot: '', copyingDepot: '', copiedDepot: '', onDownload() {}, onCopy() {},
    ...overrides,
  };
}
function render(depot, overrides) { return renderToStaticMarkup(React.createElement(Panel, props(depot, overrides))); }
function nodes(element, type) {
  if (!element || typeof element !== 'object') return [];
  return [...(element.type === type ? [element] : []), ...React.Children.toArray(element.props?.children).flatMap(child => nodes(child, type))];
}

for (const depot of ['west', 'east']) {
  const label = depot === 'west' ? 'West Depot' : 'East Depot';
  const short = depot === 'west' ? 'WD' : 'ED';
  const other = depot === 'west' ? 'EAST' : 'WEST';
  test(`${depot} uses the approved one-frame panel, own fields and paired depot/combined actions`, () => {
    const html = render(depot);
    assert.match(html, /data-pst-excel-design="fluent"/);
    assert.match(html, /PST Excel Format Log/);
    assert.match(html, /Synced 04:29/);
    assert.match(html, new RegExp(`value="${depot.toUpperCase()} COMPLETED DC"`));
    assert.match(html, new RegExp(`value="${depot.toUpperCase()} FLDC DC"`));
    assert.doesNotMatch(html, new RegExp(`${other} (?:COMPLETED|FLDC) DC`));
    assert.match(html, new RegExp(`<h3>${label}<\/h3>`));
    assert.match(html, /<h3>Combined<\/h3>/);
    assert.equal((html.match(/>Download Excel<\/span>/g) || []).length, 2);
    assert.equal((html.match(/>Copy Output<\/span>/g) || []).length, 2);
    assert.match(html, new RegExp(`Copy ${short} PST and Train Prep Excel rows 3 to 49`));
    assert.match(html, /Copy combined WD and ED PST and Train Prep Excel rows 3 to 49/);
    assert.doesNotMatch(html, /animate-ping|theme-pst-live-panel/);
  });
  test(`${depot} actions and name changes retain their own depot and combined targets`, () => {
    const calls = [];
    const tree = Panel(props(depot, {
      onDownload: key => calls.push(['download', key]), onCopy: key => calls.push(['copy', key]),
      onCompletedByChange: (key, value) => calls.push(['name', key, value]),
    }));
    nodes(tree, 'button').forEach(button => button.props.onClick());
    nodes(tree, 'input')[0].props.onChange({ target: { value: 'UPDATED DC' } });
    assert.deepEqual(calls, [['download', depot], ['copy', depot], ['download', 'combined'], ['copy', 'combined'], ['name', depot, 'UPDATED DC']]);
  });
}

test('all four export actions stay disabled while a download or copy is busy', () => {
  for (const busy of [{ downloadingDepot: 'west' }, { copyingDepot: 'combined' }]) {
    const buttons = nodes(Panel(props('east', busy)), 'button');
    assert.equal(buttons.length, 4);
    assert.ok(buttons.every(button => button.props.disabled));
  }
});
test('copy confirmation stays scoped to the copied action and uses the existing A3:M49 range', () => {
  for (const key of ['east', 'combined']) {
    const html = render('east', { copiedDepot: key });
    assert.equal((html.match(/data-copy-state="copied"/g) || []).length, 1);
    assert.equal((html.match(/Copied A3:M49/g) || []).length, 1);
    assert.match(html, /pst-excel-export-button is-copied/);
  }
});
test('FLDC progress only fills after actual confirmation, for each depot independently', () => {
  const defaults = props('west').fldcController;
  for (const [depot, count] of [['west', 3], ['east', 2]]) {
    for (const confirmed of [false, true]) {
      const html = render(depot, { fldcController: { ...defaults, isConfirmed: () => confirmed } });
      assert.match(html, new RegExp(`aria-valuenow="${confirmed ? 100 : 0}"`));
      assert.match(html, new RegExp(`aria-valuetext="${confirmed ? count : 0} of ${count} trains confirmed"`));
      assert.match(html, new RegExp(confirmed ? `All ${count} trains confirmed` : `Confirm all ${count} trains via FLDC`));
      if (!confirmed) assert.match(html, /Columns L–M stay blank until confirmed/);
    }
  }
});
test('the approved frame uses integrated verification, two columns and matching light-mode tokens', () => {
  assert.match(css, /\.pst-excel-format-panel \.pst-fldc-checklist \{ border: 0; border-top:/);
  assert.match(css, /\.pst-excel-export-groups \{[^}]*grid-template-columns: minmax\(0,1fr\) minmax\(0,1fr\)/);
  assert.match(css, /html\[data-app-theme='light'\] \.pst-excel-format-panel/);
  assert.match(css, /--pst-format-text: #102a43/);
  assert.match(css, /--pst-format-teal: #087b74/);
});

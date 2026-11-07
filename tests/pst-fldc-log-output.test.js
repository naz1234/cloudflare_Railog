import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { buildPstFldcChecklistLog, createPstFldcVerification } from '../src/lib/pstFldcVerification.js';

const source = readFileSync(new URL('../src/components/depot/PSTLogOutput.jsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../src/pages/DepotStabling.jsx', import.meta.url), 'utf8');
const checker = readFileSync(new URL('../src/components/PstFldcChecklist.jsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source.replace(/^import .*;\r?\n/gm, '').replace('export default function', 'function'), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
function components(fake = false, copied = [], stateOverride = null) {
  return new Function('React', 'useState', 'useEffect', 'buildPstFldcChecklistLog', 'navigator', 'window', `${compiled}\nreturn {PSTLogOutput, DepotLogCard, CopyButton, getCombinedPSTFldcText};`)(
    React, stateOverride || (fake ? initial => [typeof initial === 'function' ? initial() : initial, () => {}] : React.useState),
    fake ? () => {} : React.useEffect, buildPstFldcChecklistLog,
    { clipboard: { writeText: async text => copied.push(text) } }, { setTimeout: () => 1 },
  );
}
const { PSTLogOutput, DepotLogCard, CopyButton } = components();
const date = '2026-10-28';
const west = createPstFldcVerification('west', ['01'], { by: 'WEST DC', verified: true }, date);
const east = createPstFldcVerification('east', ['47'], { by: 'EAST DC', verified: true }, date);
const controller = () => ({ exportVerifications: { west, east }, saving: {}, errors: {} });
const lines = depot => [{ type: 'PST', depot, trainKey: depot === 'west' ? 'T01' : 'T47', startTime: '03:00', endTime: '03:06', road: depot === 'west' ? 'WD-ST15' : 'ED-ST02' }];
function nodes(element) {
  if (!React.isValidElement(element)) return [];
  return [element, ...React.Children.toArray(element.props.children).flatMap(nodes)];
}

for (const depot of ['west', 'east']) {
  for (const logStyle of ['elog1', 'elog2']) {
    test(`${depot} ${logStyle} displays its saved FLDC log beside PST/Prep without copying the other depot`, () => {
      const depotLabel = depot === 'west' ? 'West' : 'East';
      const props = { depotLabel, lines: lines(depot), logStyle, fldcController: controller() };
      const html = renderToStaticMarkup(React.createElement(DepotLogCard, props));
      assert.match(html, /FLDC Verification/);
      assert.match(html, /Copy FLDC/);
      assert.match(html, new RegExp(`${depotLabel} Depot — FLDC Verification`));
      assert.match(html, new RegExp(`${depot === 'west' ? 'T01' : 'T47'} — PST verified via FLDC`));
      assert.doesNotMatch(html, depot === 'west' ? /EAST DC|T47 — PST verified/ : /WEST DC|T01 — PST verified/);
      const copyActions = nodes(DepotLogCard(props)).filter(node => node.type === CopyButton);
      const fldcCopy = copyActions.find(node => node.props.label === 'Copy FLDC');
      assert.equal(fldcCopy.props.text, buildPstFldcChecklistLog(controller().exportVerifications[depot]));
      assert.equal(fldcCopy.props.disabled, false);
      for (const action of copyActions.filter(node => node !== fldcCopy && node.props.label !== 'Copy PST + FLDC')) assert.doesNotMatch(action.props.text, /FLDC/);
    });
  }
}

test('the shared output shows and copies no FLDC log while empty, saving, failed or mismatched', () => {
  for (const value of [
    { ...controller(), exportVerifications: {} },
    { ...controller(), saving: { west: 'confirm' } },
    { ...controller(), errors: { west: 'Unable to save' } },
    { ...controller(), exportVerifications: { west: east } },
  ]) {
    const props = { depotLabel: 'West', lines: [], fldcController: value };
    const html = renderToStaticMarkup(React.createElement(DepotLogCard, props));
    assert.match(html, /FLDC Verification/);
    assert.doesNotMatch(html, /PST verified via FLDC\./);
    const action = nodes(DepotLogCard(props)).find(node => node.type === CopyButton && node.props.label === 'Copy FLDC');
    assert.equal(action.props.disabled, true);
    assert.equal(action.props.text, '');
  }
});

test('FLDC remains visible with no PST/Prep text and old consumers without the controller stay unchanged', () => {
  const html = renderToStaticMarkup(React.createElement(DepotLogCard, { depotLabel: 'West', lines: [], fldcController: controller() }));
  assert.match(html, /T01 — PST verified via FLDC/);
  const legacy = renderToStaticMarkup(React.createElement(DepotLogCard, { depotLabel: 'West', lines: lines('west') }));
  assert.doesNotMatch(legacy, /FLDC/);
});

test('Copy FLDC uses the output panel copy handler and cannot copy an empty log', async () => {
  const copied = [];
  const { CopyButton: PlainCopy } = components(true, copied);
  const text = buildPstFldcChecklistLog(west);
  const tree = PlainCopy({ text, label: 'Copy FLDC', disabled: false, variant: 'fldc' });
  await nodes(tree).find(node => node.type === 'button').props.onClick();
  assert.deepEqual(copied, [text]);
  for (const props of [{ text: '', disabled: false }, { text, disabled: true }]) {
    await nodes(PlainCopy({ ...props, label: 'Copy FLDC' })).find(node => node.type === 'button').props.onClick();
  }
  assert.equal(copied.length, 1);
});

test('the main output is wired for both depots and the checklist no longer renders a duplicate generated log', () => {
  for (const depot of ['west', 'east']) {
    assert.match(page, new RegExp(`<PSTLogOutput depot="${depot}"[^\\n]+fldcController=\\{fldcController\\}`));
    const html = renderToStaticMarkup(React.createElement(PSTLogOutput, { depot, logLines: [...lines('west'), ...lines('east')], fldcController: controller() }));
    assert.match(html, /PST \/ Train Prep Log Output/);
    assert.equal((html.match(/>Copy FLDC<\/button>/g) || []).length, 1);
  }
  assert.doesNotMatch(checker, /pst-fldc-generated|pst-fldc-log|Copy Log|<pre/);
  assert.match(checker, /controller\.clear\(depot\)/);
  assert.match(checker, /PST \/ Train Prep Log Output/);
  assert.match(source, /html\[data-app-theme="light"\] \.pst-clean-section-fldc/);
});

test('the additional copy button combines PST summary, grouped timings, note and saved FLDC in both depots and styles', () => {
  for (const depot of ['west', 'east']) for (const logStyle of ['elog1', 'elog2']) {
    const depotLabel = depot === 'west' ? 'West' : 'East';
    const prep = { type: 'PREP', depot, trainKey: 'T05', endTime: '04:10', road: depot === 'west' ? 'WD-ST15' : 'ED-ST02' };
    const actions = nodes(DepotLogCard({ depotLabel, lines: [...lines(depot), prep], logStyle, fldcController: controller() })).filter(node => node.type === CopyButton);
    assert.deepEqual(actions.map(action => action.props.label), ['Copy PST', 'Copy Train Prep', 'Copy FLDC', 'Copy PST + FLDC']);
    const combined = actions[3];
    assert.equal(combined.props.disabled, false);
    assert.equal(combined.props.variant, 'fldc');
    assert.ok(combined.props.text.startsWith(`PST at ${depotLabel} Depot: A total of 1 train completed PST from 03:00 to 03:06 hrs.\n\n`));
    assert.match(combined.props.text, /03:00 hrs – T(?:01|47) PST started at (?:WD–ST15|ED–ST02) and completed at 03:06 hrs\./);
    assert.match(combined.props.text, /Note: DC checked the train status/);
    assert.ok(combined.props.text.endsWith(buildPstFldcChecklistLog(controller().exportVerifications[depot])));
    assert.match(combined.props.text, /operational\.\n\n(?:West|East) Depot — FLDC Verification/);
    assert.doesNotMatch(combined.props.text, /Train Preparation|T05|ELOG-[12]/);
    assert.doesNotMatch(combined.props.text, depot === 'west' ? /EAST DC|T47/ : /WEST DC|T01/);
    // The original actions retain their own content, including the selected ELOG style.
    assert.doesNotMatch(actions[0].props.text, /FLDC/);
    assert.match(actions[1].props.text, /Train Preparation/);
    assert.equal(actions[2].props.text, buildPstFldcChecklistLog(controller().exportVerifications[depot]));
    if (logStyle === 'elog2') assert.match(actions[0].props.text, /^STABLING/);
  }
});

test('combined copy matches the 12-train screenshot structure and sorts timing groups without changing saved logs', () => {
  const groups = [
    [['30'], '02:46', '02:52', 'ED-ST02'], [['13', '45'], '02:47', '02:53', 'ED-ST02'],
    [['33', '41'], '02:48', '02:54', 'ED-ST02'], [['35', '37'], '02:49', '02:55', 'ED-ST03'],
    [['31'], '02:50', '02:56', 'ED-ST03'], [['02'], '02:51', '02:57', 'ED-ST03'],
    [['40'], '02:52', '02:58', 'ED-ST03'], [['46'], '02:54', '03:00', 'ED-ST03'],
    [['11'], '03:59', '04:05', 'ED-ST03'],
  ];
  const entries = groups.flatMap(([ids, startTime, endTime, road]) => ids.map(id => ({ type: 'PST', depot: 'east', trainKey: `T${id}`, startTime, endTime, road })));
  const reversed = [...entries].reverse(), before = JSON.stringify(reversed);
  const verification = createPstFldcVerification('east', entries.map(entry => entry.trainKey), { by: 'NAZIF', verified: true }, '2026-11-07');
  const { getCombinedPSTFldcText } = components();
  const text = getCombinedPSTFldcText(reversed, 'East', buildPstFldcChecklistLog(verification));
  assert.match(text, /^PST at East Depot: A total of 12 trains completed PST from 02:46 to 04:05 hrs\.\n\n/);
  assert.match(text, /02:47 hrs – T13 and T45 PST started at ED–ST02 and completed at 02:53 hrs\./);
  assert.equal(text.split('\n').filter(line => /^\d\d:\d\d hrs/.test(line)).length, 9);
  const timings = text.split('\n').filter(line => /^\d\d:\d\d hrs/.test(line)).map(line => line.slice(0, 5));
  assert.deepEqual(timings, [...timings].sort());
  assert.match(text, /East Depot — FLDC Verification \(2026-11-07\)\nVerified via FLDC by: NAZIF\n\n/);
  assert.equal((text.match(/— PST verified via FLDC\./g) || []).length, 12);
  assert.equal(JSON.stringify(reversed), before);
});

test('combined copy is disabled and has no text until PST and matching saved FLDC are both available', () => {
  for (const depot of ['west', 'east']) {
    const depotLabel = depot === 'west' ? 'West' : 'East', other = depot === 'west' ? 'east' : 'west';
    const invalid = [
      { ...controller(), exportVerifications: {} },
      { ...controller(), saving: { [depot]: 'saving' } },
      { ...controller(), errors: { [depot]: 'Save failed' } },
      { ...controller(), exportVerifications: { [depot]: controller().exportVerifications[other] } },
      { ...controller(), exportVerifications: { [depot]: { ...controller().exportVerifications[depot], by: '' } } },
    ];
    for (const value of invalid) {
      const action = nodes(DepotLogCard({ depotLabel, lines: lines(depot), fldcController: value })).find(node => node.type === CopyButton && node.props.label === 'Copy PST + FLDC');
      assert.equal(action.props.disabled, true);
      assert.equal(action.props.text, '');
    }
    const noPst = nodes(DepotLogCard({ depotLabel, lines: [], fldcController: controller() })).find(node => node.type === CopyButton && node.props.label === 'Copy PST + FLDC');
    assert.equal(noPst.props.disabled, true);
    assert.equal(noPst.props.text, '');
    assert.match(noPst.props.tooltip, /Complete .* PST first/);
  }
});

test('new combined action copies one complete block through the existing Copied feedback without changing verification state', async () => {
  const copied = [], updates = [];
  const { CopyButton: PlainCopy } = components(true, copied, initial => [initial, value => updates.push(value)]);
  const value = controller(), before = JSON.stringify(value);
  const action = nodes(DepotLogCard({ depotLabel: 'West', lines: lines('west'), fldcController: value })).find(node => node.type === CopyButton && node.props.label === 'Copy PST + FLDC');
  await nodes(PlainCopy(action.props)).find(node => node.type === 'button').props.onClick();
  assert.deepEqual(copied, [action.props.text]);
  assert.deepEqual(updates, [true]);
  assert.equal(JSON.stringify(value), before);
  const { CopyButton: CopiedCopy } = components(true, [], () => [true, () => {}]);
  const html = renderToStaticMarkup(CopiedCopy(action.props));
  assert.match(html, /pst-clean-action-copied/);
  assert.match(html, />Copied<\/button>/);
});

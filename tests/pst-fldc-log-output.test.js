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
function components(fake = false, copied = []) {
  return new Function('React', 'useState', 'useEffect', 'buildPstFldcChecklistLog', 'navigator', 'window', `${compiled}\nreturn {PSTLogOutput, DepotLogCard, CopyButton};`)(
    React, fake ? initial => [typeof initial === 'function' ? initial() : initial, () => {}] : React.useState,
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
      for (const action of copyActions.filter(node => node !== fldcCopy)) assert.doesNotMatch(action.props.text, /FLDC/);
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

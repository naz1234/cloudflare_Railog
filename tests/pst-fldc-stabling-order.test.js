import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Check, ShieldCheck, Trash2 } from 'lucide-react';
import ts from 'typescript';
import { groupPstFldcTrainsByStabling } from '../src/lib/pstFldcVerification.js';

const source = readFileSync(new URL('../src/components/PstFldcChecklist.jsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source.replace(/^import .*;\r?\n/gm, '').replace('export default function', 'function'), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
const Checklist = new Function('React', 'Check', 'ShieldCheck', 'Trash2', 'groupPstFldcTrainsByStabling', `${compiled}\nreturn PstFldcChecklist;`)(React, Check, ShieldCheck, Trash2, groupPstFldcTrainsByStabling);
const blocks = (...ids) => ids.map(trainId => ({ trainId }));
const westData = { 'WD-ST12': blocks('01'), 'WD-ST14': blocks('04'), 'WD-ST15': blocks('07', '47'), 'WD-ST13': blocks('02') };
const westIds = ['01', '02', '04', '07', '12', '47'];
const eastData = { 'ED-ST03': blocks('01', '46'), 'ED-ST02': blocks('47', '02') };

test('West groups use STB 15, 14, 13, 12 and physical displayed block order rather than train number', () => {
  const before = JSON.stringify(westData);
  const groups = groupPstFldcTrainsByStabling('west', westIds, westData);
  assert.deepEqual(groups.map(group => group.label), ['STB 15', 'STB 14', 'STB 13', 'STB 12', 'Other PST trains']);
  assert.deepEqual(groups.flatMap(group => group.trainIds), ['47', '07', '04', '02', '01', '12']);
  assert.equal(JSON.stringify(westData), before, 'the live stabling arrays are not reversed or mutated');
});

test('East uses its own STB 2/3 layout and never borrows a West location', () => {
  const groups = groupPstFldcTrainsByStabling('east', ['01', '02', '46', '47', '07'], { ...westData, ...eastData });
  assert.deepEqual(groups.map(group => group.label), ['STB 2', 'STB 3', 'Other PST trains']);
  assert.deepEqual(groups.flatMap(group => group.trainIds), ['47', '02', '01', '46', '07']);
});

test('only eligible PST trains appear once; manual entries stay available without invented locations', () => {
  const groups = groupPstFldcTrainsByStabling('west', ['T01', '01', '02', '47', '999', '00'], {
    'WD-ST15': blocks('', 'T01', '47', '03'), 'WD-ST14': blocks('01'), 'WD-ST13': null,
  });
  assert.deepEqual(groups, [
    { road: 'WD-ST15', label: 'STB 15', trainIds: ['47', '01'] },
    { road: 'unassigned', label: 'Other PST trains', trainIds: ['02'] },
  ]);
  assert.deepEqual(groupPstFldcTrainsByStabling('west', [], westData), []);
  assert.deepEqual(groupPstFldcTrainsByStabling('west', ['01'], null), [{ road: 'unassigned', label: 'Other PST trains', trainIds: ['01'] }]);
});

function props(depot = 'west', data = westData, calls = []) {
  return { depot, stablingData: data, controller: {
    drafts: { west: { by: 'WEST DC' }, east: { by: 'EAST DC' } }, trainIds: { west: westIds, east: ['01', '02', '46', '47'] },
    getSelectedTrainIds: () => ['01', '47'], isConfirmed: () => false,
    loaded: { west: true, east: true }, saving: {}, errors: {},
    toggleTrain: (...args) => calls.push(['tick', ...args]), confirmAll: key => calls.push(['all', key]), clear: key => calls.push(['clear', key]), updateDraft() {}, retry() {},
  } };
}
function nodes(element) {
  if (!React.isValidElement(element)) return [];
  return [element, ...React.Children.toArray(element.props.children).flatMap(nodes)];
}

test('the rendered checklist shows road headings and keeps ticks and bulk actions independent of display order', () => {
  const calls = [];
  const value = props('west', westData, calls);
  const tree = Checklist(value);
  const html = renderToStaticMarkup(React.createElement(Checklist, value));
  assert.ok(html.indexOf('>STB 15<') < html.indexOf('>STB 14<'));
  assert.ok(html.indexOf('>STB 14<') < html.indexOf('>STB 13<'));
  assert.ok(html.indexOf('>STB 13<') < html.indexOf('>STB 12<'));
  assert.equal((html.match(/role="checkbox"/g) || []).length, westIds.length);
  assert.equal((html.match(/aria-checked="true"/g) || []).length, 2);
  const ticks = nodes(tree).filter(node => node.props.role === 'checkbox');
  assert.match(ticks[0].props['aria-label'], /T47/);
  ticks[0].props.onClick();
  nodes(tree).find(node => node.type === 'button' && node.props.className.startsWith('pst-fldc-select-all')).props.onClick();
  assert.deepEqual(calls, [['tick', 'west', '47'], ['all', 'west']]);
  const moved = props('west', { ...westData, 'WD-ST15': blocks('07'), 'WD-ST12': blocks('01', '47') });
  assert.equal((renderToStaticMarkup(React.createElement(Checklist, moved)).match(/aria-checked="true"/g) || []).length, 2, 'moving a train changes its display group, not its saved check');
});

test('the actual PST stabling data is passed through the Excel panel into the checker', () => {
  const page = readFileSync(new URL('../src/pages/DepotStabling.jsx', import.meta.url), 'utf8');
  const panel = readFileSync(new URL('../src/components/PstExcelFormatLogPanel.jsx', import.meta.url), 'utf8');
  assert.match(page, /stablingData=\{depot === "west" \? westData : eastData\}/);
  assert.match(panel, /<PstFldcChecklist[^>]+stablingData=\{stablingData\}/);
});

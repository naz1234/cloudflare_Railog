import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as icons from 'lucide-react';
import ts from 'typescript';

const source = readFileSync(new URL('../src/pages/DepotStabling.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/apuMismatchChecklist.css', import.meta.url), 'utf8');
function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf('\nfunction ', start + 1);
  assert.ok(start >= 0 && end > start, name);
  return source.slice(start, end);
}
const helpers = [
  'normalizeTrainId', 'padTrainId', 'normalizeAPUMismatchTrainIds', 'collectStablingTrainIds',
  'groupAPUMismatchTrainsByStabling', 'buildAPUMismatchChecklistLog',
].map(functionSource).join('\n');
const definitions = `const WEST_ROADS = ['WD-ST15','WD-ST14','WD-ST13','WD-ST12'];
const EAST_ROADS = ['ED-ST02','ED-ST03'];\n${helpers}`;
const group = new Function(`${definitions}\nreturn groupAPUMismatchTrainsByStabling;`)();
const compiled = ts.transpileModule(`${definitions}\n${functionSource('APUMismatchChecklist')}\nreturn APUMismatchChecklist;`, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
function makeChecklist({ effects = [], copies = [] } = {}) {
  return new Function('React', 'useState', 'useEffect', 'ClipboardCheck', 'Check', 'Copy', 'Trash2', 'copyTextToClipboard', 'window', compiled)(
    React, () => ['', () => {}], effect => effects.push(effect), icons.ClipboardCheck, icons.Check,
    icons.Copy, icons.Trash2, async text => { copies.push(text); return true; }, { setTimeout() {} },
  );
}
const blocks = (...trainIds) => trainIds.map(trainId => ({ trainId }));
const west = { 'WD-ST12': blocks('01'), 'WD-ST14': blocks('04'), 'WD-ST15': blocks('07','47'), 'WD-ST13': blocks('02') };
const east = { 'ED-ST03': blocks('01','46'), 'ED-ST02': blocks('47','02') };
function nodes(element) {
  return React.isValidElement(element) ? [element, ...React.Children.toArray(element.props.children).flatMap(nodes)] : [];
}
const trainButtons = tree => nodes(tree).filter(node => node.type === 'button' && node.props.className?.startsWith('theme-apu-mismatch-train '));

test('APU West groups match FLDC roads 15→14→13→12 and visible blocks, without mutating stabling', () => {
  const before = JSON.stringify(west);
  const groups = group('west', west);
  assert.deepEqual(groups.map(value => value.label), ['STB 15','STB 14','STB 13','STB 12']);
  assert.deepEqual(groups.flatMap(value => value.trainIds), ['T47','T07','T04','T02','T01']);
  assert.equal(JSON.stringify(west), before);
});

test('APU East uses only its own roads and preserves block 1→7 order', () => {
  assert.deepEqual(group('east', { ...west, ...east }), [
    { road: 'ED-ST02', label: 'STB 2', trainIds: ['T47','T02'] },
    { road: 'ED-ST03', label: 'STB 3', trainIds: ['T01','T46'] },
  ]);
});

test('APU grouping keeps the existing unique stabling train list and hides empty roads', () => {
  assert.deepEqual(group('west', { 'WD-ST15': blocks('01','T1','','02'), 'WD-ST14': blocks('02'), 'WD-ST13': null }), [
    { road: 'WD-ST15', label: 'STB 15', trainIds: ['T02','T01'] },
  ]);
  assert.deepEqual(group('west', null), []);
  assert.deepEqual(group('east', {}), []);
});

test('both rendered APU checklists show compact road groups and retain their selected trains', () => {
  const Checklist = makeChecklist();
  for (const [depot, data, order] of [['west', west, ['T47','T07','T04','T02','T01']], ['east', east, ['T47','T02','T01','T46']]]) {
    const tree = Checklist({ depot, data, selectedTrainIds: ['T01','T47'] });
    const buttons = trainButtons(tree);
    assert.deepEqual(buttons.map(button => button.props.children[1]), order.map(id => id.slice(1)));
    buttons.forEach(button => assert.match(button.props.children[1], /^\d{2}$/));
    assert.equal(buttons.filter(button => button.props['aria-pressed']).length, 2);
    const html = renderToStaticMarkup(tree);
    assert.equal((html.match(/data-stabling-road=/g) || []).length, depot === 'west' ? 4 : 2);
    assert.match(html, /2 selected/);
    assert.match(html, /theme-apu-mismatch-trains/);
    assert.doesNotMatch(html, /Other PST trains|Verify .*FLDC/);
  }
});

test('APU train toggles and Clear retain the original controlled selection behavior for each depot', () => {
  const Checklist = makeChecklist();
  for (const [depot, data] of [['west', west], ['east', east]]) {
    const calls = [];
    const tree = Checklist({ depot, data, selectedTrainIds: ['T01','T47'], onSelectedTrainIdsChange: value => calls.push(value) });
    trainButtons(tree).find(button => button.props.children[1] === '47').props.onClick();
    trainButtons(tree).find(button => button.props.children[1] === '02').props.onClick();
    nodes(tree).find(node => node.props.className?.startsWith('theme-apu-mismatch-clear ')).props.onClick();
    assert.deepEqual(calls, [['T01'], ['T01','T47','T02'], []]);
  }
});

test('APU generated SR text, numeric output order and Copy Log remain unchanged', async () => {
  const copies = [];
  const Checklist = makeChecklist({ copies });
  const tree = Checklist({ depot: 'west', data: west, selectedTrainIds: ['T47','T01'] });
  const expected = 'T01 APU Missmatch alarm\nSR:\n\nT47 APU Missmatch alarm\nSR:';
  assert.equal(nodes(tree).find(node => node.type === 'pre').props.children, expected);
  await nodes(tree).find(node => node.props.className?.startsWith('theme-apu-mismatch-copy ')).props.onClick();
  assert.deepEqual(copies, [expected]);
});

test('moving a selected APU train only changes its group; removed trains still leave the saved selection', () => {
  const effects = [], calls = [];
  const Checklist = makeChecklist({ effects });
  const moved = { ...west, 'WD-ST15': blocks('07'), 'WD-ST12': blocks('01','47') };
  assert.equal(trainButtons(Checklist({ data: moved, selectedTrainIds: ['T47'] })).find(button => button.props.children[1] === '47').props['aria-pressed'], true);
  effects.length = 0;
  Checklist({ data: { 'WD-ST15': blocks('07') }, selectedTrainIds: ['T47'], onSelectedTrainIdsChange: value => calls.push(value) });
  effects.forEach(effect => effect());
  assert.deepEqual(calls, [[]]);
});

test('APU layout matches FLDC geometry and keeps readable light mode and phone rules', () => {
  assert.match(css, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(css, /road-label::after[^}]+border-top: 1px solid/);
  assert.match(css, /min-height: 27px[^}]+font-size: 12px; font-weight: 700/);
  assert.match(css, /width: 11px; height: 11px/);
  assert.match(css, /@media \(max-width: 767px\)[^\n]+min-height: 32px/);
  assert.match(css, /html\[data-app-theme='light'\][^\n]+border-color: #c3d2e2/);
  assert.match(source, /import "\.\.\/apuMismatchChecklist\.css"/);
});

test('APU roads fit all seven blocks on one desktop line, while stabling gives spare width to the checklist', () => {
  assert.match(css, /@media \(min-width: 768px\) \{ \.theme-apu-mismatch-trains \{ grid-template-columns: repeat\(7, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 360px\)[^\n]+repeat\(4, minmax\(0, 1fr\)\)/);
  const Checklist = makeChecklist();
  for (const depot of ['west', 'east']) {
    const road = depot === 'west' ? 'WD-ST15' : 'ED-ST02';
    const tree = Checklist({ depot, data: { [road]: blocks('01','02','03','04','05','06','07') } });
    const groups = nodes(tree).filter(node => node.props.className === 'theme-apu-mismatch-trains');
    assert.equal(groups.length, 1);
    assert.equal(trainButtons(groups[0]).length, 7);
    assert.doesNotMatch(nodes(tree)[0].props.className, /lg:w-\[420px\]/);
  }
  assert.equal((source.match(/className="pst-depot-layout /g) || []).length, 2);
  assert.equal((source.match(/className="pst-support-panels /g) || []).length, 2);
});

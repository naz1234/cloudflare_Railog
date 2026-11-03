import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { unzipSync, strFromU8 } from 'fflate';
import { Check, Loader2 } from 'lucide-react';
import ts from 'typescript';
import { onRequest } from '../functions/api/wsh2.js';
import { formatWashTime, getWashDetailsText, validateWashChanges, WSH2_LOCATIONS, WSH2_MAX_DETAILS_LENGTH } from '../src/lib/wsh2Records.js';
import { buildWsh2Docx } from '../src/lib/wsh2Docx.js';

const source = readFileSync(new URL('../src/components/Wsh2Workspace.jsx', import.meta.url), 'utf8');
const rowSource = source.slice(source.indexOf('function WashRow('), source.indexOf('export default function Wsh2Workspace'));
const compiled = ts.transpileModule(rowSource, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
const detailsSource = readFileSync(new URL('../src/components/Wsh2WashDetailsInput.jsx', import.meta.url), 'utf8');
const detailsCode = ts.transpileModule(detailsSource.replace(/^import[^\n]+\n/gm, '').replace('export default function', 'function'), { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
const WashDetailsInput = new Function('React', 'getWashDetailsText', 'WSH2_MAX_DETAILS_LENGTH', `const {useEffect,useRef,useState}=React; ${detailsCode}\nreturn Wsh2WashDetailsInput;`)(React, getWashDetailsText, WSH2_MAX_DETAILS_LENGTH);
const WashRow = new Function('React', 'Check', 'Loader2', 'formatWashTime', 'WSH2_LOCATIONS', 'Wsh2WashDetailsInput', `${compiled}\nreturn WashRow;`)(React, Check, Loader2, formatWashTime, WSH2_LOCATIONS, WashDetailsInput);

const initialRow = {
  id: '2026-11-04_L3-MV-301', trainNumber: 'L3-MV-301', date: '2026-11-04', nextWash: '2026-11-04T09:15',
  location: 'OPE', completed: false, hvac: '', washType: '', depot: '', washDetails: '', revision: 1,
};
function rowCells(row, onChange = () => {}, pending = false) {
  return React.Children.toArray(WashRow({ row, index: 0, pending, onChange }).props.children);
}

test('the actual Done button sends completion and HVAC ON together, without type or depot defaults', () => {
  let changes;
  const cells = rowCells(initialRow, value => { changes = value; });
  const button = cells[4].props.children;
  assert.equal(button.props['aria-checked'], false);
  button.props.onClick();
  assert.deepEqual(changes, { completed: true, hvac: 'ON' });
  const completed = { ...initialRow, ...validateWashChanges(changes) };
  const updated = rowCells(completed);
  assert.equal(updated[4].props.children.props['aria-checked'], true);
  assert.equal(updated[5].props.children.props['aria-checked'], true);
  assert.equal(completed.washType, '');
  assert.equal(completed.depot, '');
  assert.equal(rowCells(initialRow, () => {}, true)[4].props.children.props.disabled, true);
});

test('unchecking Done preserves HVAC and manual wash details; HVAC can still be edited independently', () => {
  const row = { ...initialRow, completed: true, hvac: 'ON', washType: 'Full', depot: 'east' };
  const changes = [];
  const cells = rowCells(row, value => changes.push(value));
  cells[4].props.children.props.onClick();
  assert.deepEqual(changes[0], { completed: false });
  assert.deepEqual({ ...row, ...validateWashChanges(changes[0]) }, { ...row, completed: false });
  cells[5].props.children.props.onClick();
  assert.deepEqual(changes[1], { hvac: '' });
  assert.deepEqual(validateWashChanges(changes[1]), { hvac: '' });
});

test('server normalization covers old completion-only clients but does not infer manual wash fields', () => {
  const input = { completed: true };
  assert.deepEqual(validateWashChanges(input), { completed: true, hvac: 'ON' });
  assert.deepEqual(input, { completed: true });
  assert.deepEqual(validateWashChanges({ completed: true, hvac: '' }), { completed: true, hvac: 'ON' });
  assert.deepEqual(validateWashChanges({ completed: false }), { completed: false });
  assert.deepEqual(validateWashChanges({ completed: true, washType: '', depot: '' }), { completed: true, hvac: 'ON', washType: '', depot: '', washDetails: '' });
  assert.throws(() => validateWashChanges({ completed: true, hvac: 'OFF' }));
});

function apiFixture(overrides = {}) {
  let row = { ...initialRow, ...overrides };
  const writes = [];
  const fields = { completed_at: 'completedAt', updated_at: 'updatedAt', updated_by: 'updatedBy', wash_type: 'washType', wash_details: 'washDetails' };
  const env = {
    WSH2_FILES: {},
    DB: {
      prepare(sql) {
        return {
          bind(...values) { this.values = values; return this; },
          async first() { return { ...row }; },
          async run() {
            writes.push({ sql, values: this.values });
            const values = this.values;
            if (values.at(-2) !== row.id || values.at(-1) !== row.revision) return { meta: { changes: 0 } };
            const columns = [...sql.slice(sql.indexOf(' SET ') + 5, sql.indexOf(' WHERE ')).matchAll(/(?:^|, )(\w+) = \?/g)].map(match => match[1]);
            columns.forEach((column, index) => { row[fields[column] || column] = values[index]; });
            row.revision++;
            return { meta: { changes: 1 } };
          },
        };
      },
      async batch() { return [{ results: [{ ...row }] }, { results: [] }]; },
    },
  };
  async function patch(changes, revision = row.revision) {
    return onRequest({
      request: new Request('https://local.test/api/wsh2', { method: 'PATCH', headers: { Origin: 'https://local.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id, revision, changes }) }),
      env, data: { authUser: { email: 'operator@example.invalid' } },
    });
  }
  async function readOtherComputer() {
    const response = await onRequest({ request: new Request('https://local.test/api/wsh2'), env, data: { authUser: { email: 'second@example.invalid' } } });
    return (await response.json()).rows[0];
  }
  return { patch, readOtherComputer, writes };
}

test('the shared API atomically saves Done plus HVAC, and another computer reads both with manual fields blank', async () => {
  const f = apiFixture();
  const response = await f.patch({ completed: true });
  assert.equal(response.status, 200);
  const { row } = await response.json();
  assert.equal(row.completed, true);
  assert.equal(row.hvac, 'ON');
  assert.equal(row.washType, '');
  assert.equal(row.depot, '');
  assert.equal(row.revision, 2);
  assert.ok(row.completedAt);
  assert.equal(f.writes.length, 1);
  assert.match(f.writes[0].sql, /completed = \?, hvac = \?/);
  assert.doesNotMatch(f.writes[0].sql, /wash_type =|depot =/);
  assert.deepEqual(await f.readOtherComputer(), row);
});

test('manual choices survive Done, stale edits do not partially apply, and HVAC can be cleared later', async () => {
  for (const depot of ['west', 'east']) {
    const f = apiFixture({ washType: 'Partial', depot });
    const first = await f.patch({ completed: true });
    assert.equal(first.status, 200);
    let row = (await first.json()).row;
    assert.equal(row.washType, 'Partial');
    assert.equal(row.depot, depot);
    const stale = await f.patch({ completed: false }, 1);
    assert.equal(stale.status, 409);
    row = (await stale.json()).row;
    assert.equal(row.completed, true);
    assert.equal(row.hvac, 'ON');
    const manual = await f.patch({ hvac: '' });
    assert.equal(manual.status, 200);
    row = (await manual.json()).row;
    assert.equal(row.completed, true);
    assert.equal(row.hvac, '');
    assert.equal(row.washType, 'Partial');
    assert.equal(row.depot, depot);
  }
});

test('the last column is one truly blank text box, retaining legacy details and safe save behavior', () => {
  const blank = renderToStaticMarkup(React.createElement(WashDetailsInput, { row: initialRow, onChange() {} }));
  assert.equal((blank.match(/<input\b/g) || []).length, 1);
  assert.match(blank, /type="text"/);
  assert.match(blank, /value=""/);
  assert.doesNotMatch(blank, /<select|placeholder=/);
  const legacy = renderToStaticMarkup(React.createElement(WashDetailsInput, { row: { ...initialRow, washType: 'Partial', depot: 'east' }, onChange() {} }));
  assert.match(legacy, /value="Partial \/ ED"/);
  assert.match(detailsSource, /onBlur=\{save\}/);
  assert.match(detailsSource, /event.key === 'Enter'/);
  assert.match(detailsSource, /onChange\(\{ washDetails: next \}, revision.current\)/);
  assert.match(source, /revision: expectedRevision \?\? row.revision/);
});

test('manual text is bounded, printable, clearable, and never inferred by Done', () => {
  assert.deepEqual(validateWashChanges({ washDetails: '  Partial / WD  ' }), { washDetails: 'Partial / WD', washType: '', depot: '' });
  assert.deepEqual(validateWashChanges({ washDetails: '' }), { washDetails: '', washType: '', depot: '' });
  for (const value of [null, 25, {}, 'x'.repeat(WSH2_MAX_DETAILS_LENGTH + 1), 'Full\nED', 'Full\u0000']) {
    assert.throws(() => validateWashChanges({ washDetails: value }));
  }
  assert.equal(validateWashChanges({ washDetails: 'x'.repeat(WSH2_MAX_DETAILS_LENGTH) }).washDetails.length, WSH2_MAX_DETAILS_LENGTH);
  assert.equal(getWashDetailsText({}), '');
  assert.equal(getWashDetailsText({ washType: 'Full', depot: 'west' }), 'Full / WD');
  assert.equal(getWashDetailsText({ washDetails: 'P / ED 22:00', washType: 'Full', depot: 'west' }), 'P / ED 22:00');
});

test('manual text syncs, prints safely, survives Done, and can clear older dropdown choices', async () => {
  const f = apiFixture({ washType: 'Partial', depot: 'east' });
  const saved = await f.patch({ washDetails: 'Full / WD & <checked>' });
  assert.equal(saved.status, 200);
  let row = (await saved.json()).row;
  assert.equal(row.washDetails, 'Full / WD & <checked>');
  assert.equal(row.washType, '');
  assert.equal(row.depot, '');
  assert.deepEqual(await f.readOtherComputer(), row);
  const done = await f.patch({ completed: true });
  row = (await done.json()).row;
  assert.equal(row.hvac, 'ON');
  assert.equal(row.washDetails, 'Full / WD & <checked>');
  const xml = strFromU8(unzipSync(buildWsh2Docx([row]))['word/document.xml']);
  assert.match(xml, /Full \/ WD &amp; &lt;checked&gt;/);
  const stale = await f.patch({ washDetails: 'Partial / ED' }, 1);
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).row.washDetails, 'Full / WD & <checked>');
  const cleared = await f.patch({ washDetails: '' });
  row = (await cleared.json()).row;
  assert.equal(getWashDetailsText(row), '');
  assert.equal(row.completed, true);
  assert.equal(row.hvac, 'ON');
});

test('manual field storage is an additive migration and report reimports never overwrite it', () => {
  const migration = readFileSync(new URL('../migrations/0005_wsh2_wash_details.sql', import.meta.url), 'utf8');
  assert.match(migration, /ALTER TABLE wsh2_washes ADD COLUMN wash_details TEXT NOT NULL DEFAULT ''/);
  assert.doesNotMatch(migration, /DROP|DELETE|UPDATE|RENAME/);
  const api = readFileSync(new URL('../functions/api/wsh2.js', import.meta.url), 'utf8');
  const upsert = api.slice(api.indexOf('ON CONFLICT(id) DO UPDATE SET'), api.indexOf('.bind(row.id', api.indexOf('ON CONFLICT(id) DO UPDATE SET')));
  assert.doesNotMatch(upsert, /wash_details|wash_type|depot =|completed =|hvac =/);
});

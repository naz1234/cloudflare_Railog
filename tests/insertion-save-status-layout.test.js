import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import postcss from 'postcss';

const source = readFileSync(new URL('../src/components/depot/InsertionSaveStatus.jsx', import.meta.url), 'utf8');
const css = postcss.parse(readFileSync(new URL('../src/insertionSaveStatus.css', import.meta.url), 'utf8'));
const headerCss = postcss.parse(readFileSync(new URL('../src/insertionReqHeader.css', import.meta.url), 'utf8'));
const compiled = ts.transpileModule(source.replace('export default function', 'function') + '\nreturn InsertionSaveStatus;', { compilerOptions: { jsx: ts.JsxEmit.React } }).outputText;
const Status = new Function('React', compiled)(React);
const declaration = (rule, prop) => rule?.nodes.find(node => node.prop === prop)?.value;
function rule(selector) { let result; css.walkRules(node => { if (node.selector === selector) result = node; }); assert.ok(result, selector); return result; }

test('only Failed feedback reserves its own full toolbar row, keeping normal Saved and Saving compact', () => {
  for (const depot of ['west', 'east']) for (const phase of ['saved', 'saving', 'failed']) {
    const html = renderToStaticMarkup(React.createElement(Status, { depot, status: { phase, conflict: phase === 'failed', error: phase === 'failed' ? 'Changed in another session. Your input is kept; review the shared version before replacing it.' : '' } }));
    assert.equal(html.includes('insertion-save-feedback has-error'), phase === 'failed');
    assert.equal(html.includes('insertion-save-error'), phase === 'failed');
    if (phase === 'failed') {
      assert.match(html, /Retry save/); assert.match(html, /Use shared/);
      assert.match(html, /Your input is kept/);
    }
  }
  const failed = rule('.theme-insertion-section .insertion-save-feedback.has-error');
  assert.equal(declaration(failed, 'flex-basis'), '100%');
  assert.equal(declaration(failed, 'width'), '100%');
});

test('long error text wraps on a separate line and stays within both desktop and phone toolbars', () => {
  const feedback = rule('.theme-insertion-section .insertion-save-feedback');
  const error = rule('.theme-insertion-section .insertion-save-feedback .insertion-save-error');
  assert.equal(declaration(feedback, 'min-width'), '0');
  assert.equal(declaration(feedback, 'max-width'), '100%');
  assert.equal(declaration(error, 'flex-basis'), '100%');
  assert.equal(declaration(error, 'max-width'), '100%');
  assert.equal(declaration(error, 'white-space'), 'normal');
  assert.equal(declaration(error, 'overflow-wrap'), 'anywhere');
  assert.equal(declaration(error, 'line-height'), '1.5');
  assert.equal(error.parent.type, 'root');
  for (const node of [feedback, failedRule(), error]) {
    assert.equal(declaration(node, 'position'), undefined);
    assert.equal(declaration(node, 'height'), undefined);
    assert.equal(declaration(node, 'overflow'), undefined);
  }
});
function failedRule() { return rule('.theme-insertion-section .insertion-save-feedback.has-error'); }

test('tracking-ID help is in document flow, below the variable-height header, instead of fixed at 69px', () => {
  const notes = [];
  headerCss.walkRules(node => { if (node.selector.endsWith('.insertion-tracking-remark-note')) notes.push(node); });
  assert.ok(notes.length);
  for (const note of notes) {
    assert.notEqual(declaration(note, 'position'), 'absolute');
    assert.equal(declaration(note, 'top'), undefined);
    assert.equal(declaration(note, 'right'), undefined);
  }
  assert.equal(declaration(notes[0], 'margin'), '0 0 12px');
  const page = readFileSync(new URL('../src/pages/DepotStabling.jsx', import.meta.url), 'utf8');
  const section = page.slice(page.indexOf('function InsertionStablingSection('));
  assert.ok(section.indexOf('className="insertion-tracking-remark-note"') > section.indexOf('<InsertionSectionTitle'));
});

test('layout changes preserve Retry, shared-version recovery callbacks and accessible error reporting', () => {
  const calls = [];
  const tree = Status({ depot: 'east', status: { phase: 'failed', conflict: true, error: 'Keep pending data' }, onRetry: () => calls.push('retry'), onUseShared: () => calls.push('shared') });
  const buttons = React.Children.toArray(tree.props.children).filter(node => node.type === 'button');
  buttons[0].props.onClick(); buttons[1].props.onClick();
  assert.deepEqual(calls, ['retry', 'shared']);
  const html = renderToStaticMarkup(tree);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /East Depot: Failed\. Keep pending data/);
  css.walkRules(node => { if (node.selector.startsWith('.theme-insertion-section')) assert.doesNotMatch(node.selector, /theme-pst|train-card|tid-input/); });
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { inspectRemovalScanReview } from '../src/lib/removalScanReview.js';
import { summarizeRemovalScan } from '../src/lib/removalImageAssignments.js';

const require = createRequire(import.meta.url);
const { transformSync } = createRequire(require.resolve('vite'))('esbuild');
const source = readFileSync(new URL('../src/components/depot/RemovalScan.jsx', import.meta.url), 'utf8');
const component = source.slice(source.indexOf('export function RemovalScanUploader'), source.indexOf('export default function RemovalScanButton'));
const compiled = transformSync(component, { loader: 'jsx', format: 'cjs', define: { 'import.meta.env.DEV': 'false' } }).code;
const session = () => ({ status: 'review', target: { supportsCorrections: true, rows: [{ tid: '101' }, { tid: '104' }] },
  extraction: { reviewId: 'photo-1', partial: true, uncertain: true, rows: [{ vehicleId: '319', trainId: '19', tid: '101' }, { vehicleId: '833', trainId: '', tid: '104' }] } });

function harness(initial = session()) {
  const states = [], refs = [], dependencies = [], requests = [];
  let stateIndex = 0, refIndex = 0, effectIndex = 0, effects = [], dirty = false;
  const context = {
    exports: {}, module: { exports: {} },
    React: { Fragment: 'fragment', createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }) },
    useState: (value) => {
      const index = stateIndex++;
      if (!(index in states)) states[index] = index === 0 ? initial : value;
      return [states[index], (next) => { states[index] = typeof next === 'function' ? next(states[index]) : next; dirty = true; }];
    },
    useRef: (value) => { const index = refIndex++; return refs[index] ||= { current: value }; },
    useEffect: (callback, deps) => {
      const index = effectIndex++;
      // Exercise the review-reset effect. Polling is delivered as a session
      // update below, without real browser timers or production requests.
      if (deps.length === 1 && (!dependencies[index] || deps.some((value, i) => value !== dependencies[index][i]))) effects.push(callback);
      dependencies[index] = deps;
    },
    inspectRemovalScanReview, summarizeRemovalScan,
    Camera: 'camera-icon', Image: 'image-icon', Loader2: 'loader-icon', Check: 'check-icon',
    removalScanRequest: async (id, token, options) => { requests.push(JSON.parse(options.body)); return { status: 'ready' }; },
  };
  runInNewContext(compiled, context);
  const render = () => {
    let tree;
    for (let pass = 0; pass < 3; pass++) {
      stateIndex = refIndex = effectIndex = 0; effects = []; dirty = false;
      tree = context.module.exports.RemovalScanUploader({ id: 'test-session', token: 'test-token' });
      effects.forEach((effect) => effect());
      if (!dirty) break;
    }
    return tree;
  };
  return { render, requests, poll: (value) => { states[0] = value; } };
}

const nodes = (tree) => tree && typeof tree === 'object' ? [tree, ...(tree.children || []).flatMap(nodes)] : [];
const field = (tree, label) => nodes(tree).find((node) => node.props['aria-label'] === label);
const button = (tree) => nodes(tree).find((node) => node.type === 'button' && node.props.className === 'removal-scan-primary');
const checkbox = (tree) => nodes(tree).find((node) => node.type === 'input' && node.props.type === 'checkbox');

test('misread digits can be corrected, stay edited through polling, and are submitted only after review', async () => {
  const view = harness();
  let tree = view.render();
  assert.equal(field(tree, 'Vehicle ID row 2').props.value, '833');
  assert.equal(field(tree, 'Vehicle ID row 2').props['aria-invalid'], true);
  assert.equal(button(tree).props.disabled, true);
  field(tree, 'Vehicle ID row 2').props.onChange({ target: { value: '333' } });
  tree = view.render();
  assert.equal(field(tree, 'Vehicle ID row 2').props['aria-invalid'], false);
  assert.ok(nodes(tree).some((node) => node.type === 'td' && node.children.includes('33')));
  assert.equal(button(tree).props.disabled, true);
  checkbox(tree).props.onChange({ target: { checked: true } });
  tree = view.render();
  assert.equal(button(tree).props.disabled, false);
  view.poll(session());
  tree = view.render();
  assert.equal(field(tree, 'Vehicle ID row 2').props.value, '333');
  assert.equal(checkbox(tree).props.checked, true);
  field(tree, 'Tracking ID row 2').props.onChange({ target: { value: '104' } });
  tree = view.render();
  assert.equal(checkbox(tree).props.checked, false);
  checkbox(tree).props.onChange({ target: { checked: true } });
  tree = view.render();
  await button(tree).props.onClick();
  assert.equal(view.requests[0].reviewId, 'photo-1');
  assert.equal(view.requests[0].partial, true);
  assert.deepEqual(view.requests[0].rows[1], { vehicleId: '333', tid: '104' });
});

test('a new photo discards old edits and review consent, while legacy sessions remain read-only', () => {
  const view = harness();
  let tree = view.render();
  field(tree, 'Vehicle ID row 2').props.onChange({ target: { value: '333' } });
  tree = view.render();
  checkbox(tree).props.onChange({ target: { checked: true } });
  const newer = session(); newer.extraction.reviewId = 'photo-2';
  view.poll(newer);
  tree = view.render();
  assert.equal(field(tree, 'Vehicle ID row 2').props.value, '833');
  assert.equal(checkbox(tree).props.checked, false);
  assert.equal(button(tree).props.disabled, true);
  const legacy = session(); legacy.target.supportsCorrections = false; delete legacy.extraction.reviewId;
  legacy.extraction.rows[1] = { vehicleId: '333', trainId: '33', tid: '104' };
  tree = harness(legacy).render();
  assert.equal(field(tree, 'Vehicle ID row 2'), undefined);
  assert.ok(checkbox(tree));
});

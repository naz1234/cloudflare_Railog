import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import postcss from 'postcss';

const source = readFileSync(new URL('../src/pages/DepotStabling.jsx', import.meta.url), 'utf8');
const skin = postcss.parse(readFileSync(new URL('../src/pstSlate.css', import.meta.url), 'utf8'));
const declarationsFor = ending => {
  const values = {};
  skin.walkRules(rule => {
    if (rule.selector.endsWith(ending)) rule.walkDecls(decl => { values[decl.prop] = decl.value; });
  });
  return values;
};

test('PST slate is desktop-only and cannot affect REQ, PSS or mobile cards', () => {
  let count = 0;
  skin.walkRules(rule => {
    count++;
    let boundary = rule.parent;
    while (boundary && boundary.name !== 'media') boundary = boundary.parent;
    assert.equal(boundary?.params, '(min-width: 768px)');
    for (const selector of rule.selectors) {
      assert.match(selector, /^html\[data-app-theme(?:="light")?\] (?:#root \.app-shell\[data-active-page="pst"\]|\.pst-sync-tooltip(?:\s|$))/);
    }
  });
  assert.ok(count > 40);
  assert.match(source, /import "\.\.\/pstSlate\.css"/);
});

test('PST support panels have a bounded width and consistent spacing without squeezing the train grid', () => {
  const workspace = declarationsFor(' .mobile-pst-workspace');
  assert.equal(workspace.container, 'pst-workspace / inline-size');
  assert.equal(workspace['max-width'], '1526px');
  assert.equal(workspace.gap, '12px');
  const support = declarationsFor(' .pst-support-panels');
  assert.equal(support['max-width'], '560px');
  assert.equal(support.gap, '12px');
  const layouts = [];
  skin.walkRules(rule => {
    if (!rule.selector.endsWith(' .pst-depot-layout')) return;
    layouts.push({ parent: rule.parent, columns: rule.nodes.find(node => node.prop === 'grid-template-columns')?.value });
  });
  assert.equal(layouts[0].columns, 'minmax(0, 1fr)');
  assert.equal(layouts[1].parent.name, 'container');
  assert.equal(layouts[1].parent.params, 'pst-workspace (min-width: 1386px)');
  assert.equal(layouts[1].columns, '954px minmax(420px, 560px)');
  assert.equal((source.match(/className="pst-depot-layout /g) || []).length, 2);
  assert.equal((source.match(/className="pst-support-panels /g) || []).length, 2);
  assert.equal(declarationsFor(' .pst-excel-format-header')['min-height'], '60px');
  assert.equal(declarationsFor(' .theme-apu-mismatch-header')['min-height'], '60px');
  assert.equal(declarationsFor(' .pst-fldc-road-list').gap, '7px');
  assert.equal(declarationsFor(' .theme-apu-mismatch-road-list').gap, '7px');
});

test('PST uses the same REQ slate palette for dark and light panels', () => {
  const req = postcss.parse(readFileSync(new URL('../src/stablingSlate.css', import.meta.url), 'utf8'));
  for (const theme of ['', '="light"']) {
    const selector = `html[data-app-theme${theme}]`;
    const palette = declarationsFor(`${selector} #root .app-shell[data-active-page="pst"]`);
    const reqPalette = {};
    req.walkRules(rule => {
      if (rule.selector === `${selector} .theme-stabling-section[data-stabling-design="compact-slate"]`) {
        rule.walkDecls(decl => { reqPalette[decl.prop] = decl.value; });
      }
    });
    for (const key of ['panel', 'control', 'line', 'text', 'muted']) {
      assert.equal(palette[`--pst-slate-${key}`], reqPalette[`--stabling-${key}`], `${theme} ${key}`);
    }
  }
});

test('PST depot divider has 24px clearance above and below without changing panel gaps', () => {
  const workspace = declarationsFor(' .mobile-pst-workspace');
  const divider = declarationsFor(' .mobile-pst-workspace > .pst-depot-divider');
  assert.equal(workspace.gap, '12px');
  assert.equal(divider['margin-block'], '12px');
  assert.equal(parseFloat(workspace.gap) + parseFloat(divider['margin-block']), 24);
  assert.equal(declarationsFor(' .pst-support-panels').gap, '12px');
});

test('PST toolbar distinguishes its plain label from aligned actions and colour-coded clears', () => {
  const label = declarationsFor(' .theme-pst-section .theme-insertion-editable-label');
  assert.equal(label.border, '0');
  assert.equal(label.background, 'transparent');
  assert.equal(label.cursor, 'default');
  assert.equal(label['box-shadow'], 'none');
  const buttons = declarationsFor(' .theme-pst-section .mobile-section-actions button');
  assert.equal(buttons.height, '32px');
  assert.equal(buttons['align-items'], 'center');
  assert.equal(buttons['white-space'], 'nowrap');
  assert.equal(declarationsFor(' .theme-pst-section .mobile-section-actions')['justify-content'], 'space-between');
  const confirmation = declarationsFor(' .theme-pst-clear-button.is-confirming');
  assert.equal(confirmation.background, '#b4233f');
  assert.equal(confirmation.color, '#ffffff');
  assert.equal(confirmation['font-size'], '12px');
  for (const [modifier, token] of [['pst','pst'], ['prep','prep'], ['trains','all']]) {
    const clear = declarationsFor(` .theme-pst-clear-button.is-${modifier}:not(.is-confirming)`);
    assert.equal(clear.color, `var(--pst-slate-clear-${token})`);
    assert.equal(clear.background, `var(--pst-slate-clear-${token}-bg)`);
    for (const theme of ['', '="light"']) {
      const palette = declarationsFor(`html[data-app-theme${theme}] #root .app-shell[data-active-page="pst"]`);
      assert.ok(palette[`--pst-slate-clear-${token}`]);
      assert.ok(palette[`--pst-slate-clear-${token}-bg`]);
    }
  }
});

test('PST Sync popup styles its portal and arrow for both themes without hiding the reset warning', () => {
  const tooltip = readFileSync(new URL('../src/components/ActionTooltip.jsx', import.meta.url), 'utf8');
  assert.match(tooltip, /contentClassName = ""/);
  assert.match(tooltip, /\$\{contentClassName\}/);
  assert.match(tooltip, /action-tooltip-arrow/);
  assert.match(source, /contentClassName=\{workLabel === "PST \/ Train Prep" \? "pst-sync-tooltip" : ""\}/);
  assert.match(source, /stabling-sync-tooltip-warning[\s\S]*?\{syncTooltip.warning\}/);
  for (const [theme, background] of [['', '#10263b'], ['="light"', '#ffffff']]) {
    assert.equal(declarationsFor(`html[data-app-theme${theme}] .pst-sync-tooltip`)['--pst-tooltip-bg'], background);
  }
  const warning = declarationsFor(' .pst-sync-tooltip .stabling-sync-tooltip-warning');
  assert.equal(warning.background, 'transparent');
  assert.equal(warning.color, 'var(--pst-tooltip-warning)');
  assert.equal(warning['border-top'], '1px solid var(--pst-tooltip-line)');
  assert.equal(declarationsFor(' .pst-sync-tooltip .action-tooltip-arrow').fill, 'var(--pst-tooltip-bg)');
});

test('depot, Excel, APU, manual and log windows share rounded slate frames', () => {
  const frame = declarationsFor(' :is(.theme-pst-section,.pst-excel-format-panel,.theme-apu-mismatch-panel,.pst-clean-shell,.pst-manual-shell)');
  assert.equal(frame.background, 'var(--pst-slate-panel)');
  assert.equal(frame.border, '1px solid var(--pst-slate-line)');
  assert.equal(frame['border-radius'], '28px');
  const title = declarationsFor(' :is(.theme-pst-title,.pst-excel-format-heading h2,.theme-apu-mismatch-header h3,.pst-clean-title,.pst-manual-heading h3)');
  assert.equal(title['font-size'], '16px');
  assert.equal(title['font-weight'], '700');
  assert.equal(title['text-shadow'], 'none');
});

test('operational state fills, FLDC selections, confirmations and copy feedback remain distinct', () => {
  assert.equal(declarationsFor(' .theme-pst-card').background, undefined);
  assert.equal(declarationsFor(' .theme-pst-card').border, undefined);
  skin.walkRules(rule => {
    assert.doesNotMatch(rule.selector, /theme-pst-card\.is-(pst-done|pst-confirming|prep-done)/);
    if (rule.selector.includes('.theme-apu-mismatch-train')) assert.match(rule.selector, /:not\(\.is-selected\)/);
    if (rule.selector.includes('.theme-pst-clear-button') && !rule.selector.endsWith(' .theme-pst-clear-button.is-confirming')) assert.match(rule.selector, /:not\(\.is-confirming\)/);
    if (rule.selector.includes('.pst-clean-action')) assert.match(rule.selector, /:not\(\.pst-clean-action-copied\):not\(\.pst-clean-action-danger\)/);
  });
  assert.equal(declarationsFor(' .pst-fldc-train.is-selected').background, 'var(--fldc-success-bg)');
  assert.equal(declarationsFor(' .pst-excel-export-button.is-copied').color, 'var(--pst-format-success)');
  assert.equal(declarationsFor(' .pst-fldc-select-all.is-confirmed').color, 'var(--fldc-success)');
  assert.equal(declarationsFor(' .theme-pst-section .theme-insertion-refresh-button.is-dirty').color, 'var(--pst-slate-warning)');
});

test('local preview isolates records and prevents production API writes', () => {
  const preview = readFileSync(new URL('../scripts/preview-pst-slate.mjs', import.meta.url), 'utf8');
  assert.match(preview, /preview-compact-slate-api\.js/);
  assert.match(preview, /host: '127\.0\.0\.1'/);
  assert.match(preview, /connect-src 'self'/);
  assert.match(preview, /request\.url\.startsWith\('\/api\/'\)/);
  assert.match(preview, /response\.writeHead\(403/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import requestGroupVisibilityPlugin from '../build/requestGroupVisibilityPlugin.js';

const depotStablingPath = new URL('../src/pages/DepotStabling.jsx', import.meta.url);

function transformDepotStabling() {
  const source = readFileSync(depotStablingPath, 'utf8');
  const plugin = requestGroupVisibilityPlugin();
  return plugin.transform(source, depotStablingPath.pathname)?.code || '';
}

test('hidden request groups are filtered from stabling, Insertion and Removal Summary inputs', () => {
  const code = transformDepotStabling();

  assert.match(code, /hiddenByRequestGroup: req\?\.groupHidden === true/);
  assert.match(code, /const visibleRemovalRequests = requests\.filter\(\(request\) => request\?\.groupHidden !== true\)/);
  assert.match(code, /title="WEST DEPOT STABLING"[\s\S]*?maintenanceMap=\{visibleRequestMaintenanceMap\}/);
  assert.match(code, /title="EAST DEPOT STABLING"[\s\S]*?maintenanceMap=\{visibleRequestMaintenanceMap\}/);
  assert.match(code, /<InsertionTabContent[\s\S]*?maintenanceMap=\{visibleRequestMaintenanceMap\}/);
  assert.match(code, /<TrainRemPanel\s+maintenanceMap=\{visibleRequestMaintenanceMap\}[\s\S]*?requests=\{visibleRemovalRequests\}/);
});

test('Removal Log Output keeps the full request data', () => {
  const code = transformDepotStabling();

  assert.match(code, /<RemovalLogOutputFromTrainRem\s+trainRemState=\{trainRemCheckState\}\s+maintenanceMap=\{maintenanceMap\}\s+requests=\{requests\}/);
});

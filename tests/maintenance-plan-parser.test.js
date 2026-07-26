import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractMaintenancePlan,
  extractPrefixedTrainList,
  normalizePlanDate,
} from '../functions/lib/maintenance-plan-parser.js';
import { onRequestPost } from '../functions/api/maintenance-image.js';

function cell(rowIndex, columnIndex, content, extra = {}) {
  return { rowIndex, columnIndex, content, ...extra };
}

function sampleAzureResult() {
  return {
    tables: [
      {
        rowCount: 7,
        columnCount: 10,
        cells: [
          cell(0, 0, '#', { kind: 'columnHeader' }),
          cell(0, 1, 'Train', { kind: 'columnHeader' }),
          cell(0, 2, 'From\nBuilding', { kind: 'columnHeader' }),
          cell(0, 3, 'From track', { kind: 'columnHeader' }),
          cell(0, 4, 'To\nBuilding', { kind: 'columnHeader' }),
          cell(0, 5, 'To track', { kind: 'columnHeader' }),
          cell(0, 6, 'Third Rail Operation', { kind: 'columnHeader' }),
          cell(0, 7, 'Notes', { kind: 'columnHeader' }),
          cell(0, 8, 'By Time', { kind: 'columnHeader' }),
          cell(0, 9, '[ PM Team Leader ]', { kind: 'columnHeader' }),

          cell(1, 0, '1'),
          cell(1, 1, '18'),
          cell(1, 2, 'C'),
          cell(1, 3, '10'),
          cell(1, 4, 'G'),
          cell(1, 5, '?'),
          cell(1, 8, 'Evening shift'),
          cell(1, 9, 'Abdulrahman', { rowSpan: 2 }),

          cell(2, 0, '2'),
          cell(2, 1, '27'),
          cell(2, 2, 'G'),
          cell(2, 3, '?'),
          cell(2, 4, 'C'),
          cell(2, 5, '10'),
          cell(2, 7, 'For Maintenance PM (PLANNED)'),
          cell(2, 8, 'Evening shift'),

          cell(3, 0, '3'),
          cell(3, 1, '27'),
          cell(3, 2, 'C'),
          cell(3, 3, '10'),
          cell(3, 4, 'G'),
          cell(3, 5, '?'),
          cell(3, 8, 'Morning shift'),
          cell(3, 9, 'Abdulaziz', { rowSpan: 2 }),

          cell(4, 0, '4'),
          cell(4, 1, '1'),
          cell(4, 2, 'G'),
          cell(4, 3, '?'),
          cell(4, 4, 'C'),
          cell(4, 5, '10'),
          cell(4, 7, 'For Maintenance PM (PLANNED)'),
          cell(4, 8, 'Morning shift'),

          cell(5, 0, 'S'),
          cell(5, 1, 'TS32(Wk), TS33(Wk), TS11(Wk), TS11(Bwk)', { columnSpan: 6 }),
          cell(5, 7, 'Need These trains in Stabling building (WD)'),
          cell(5, 8, '26/07/2026:\nEvening shift\n(19:00 to 05:00)'),
          cell(5, 9, 'Abdulrahman'),

          cell(6, 0, 'S'),
          cell(6, 1, 'TS37(Wk), TS06(Wk), TS30(Wk), TS32(Bwk), TS19(Bwk)', { columnSpan: 6 }),
          cell(6, 7, 'Need These trains in Stabling building (WD)'),
          cell(6, 8, '27/07/2026:\nMorning shift\n(10:00 to 16:00)'),
          cell(6, 9, 'Abdulaziz'),
        ],
      },
    ],
  };
}

test('extracts the expected G to C and PM lists from Azure table cells', () => {
  const result = extractMaintenancePlan(sampleAzureResult());

  assert.equal(result.recognized, true);
  assert.deepEqual(result.extraction, {
    eveningDate: '26-Jul',
    morningDate: '27-Jul',
    eveningGToC: ['27'],
    morningGToC: ['01'],
    eveningPM: ['32', '33', '11'],
    morningPM: ['37', '06', '30', '32', '19'],
  });
  assert.deepEqual(result.diagnostics, {
    tableCount: 1,
    headerRow: 0,
    movementRows: 2,
    pmRows: 2,
    conflictingDateShifts: [],
    missingSummaryShifts: [],
    lowConfidenceValues: [],
    unverifiedConfidenceValues: [
      'train header',
      'fromBuilding header',
      'toBuilding header',
      'byTime header',
      'evening G to C train',
      'evening from building',
      'evening to building',
      'evening movement shift',
      'morning G to C train',
      'morning from building',
      'morning to building',
      'morning movement shift',
      'evening PM shift',
      'evening PM train list',
      'morning PM shift',
      'morning PM train list',
    ],
  });
});

test('deduplicates prefixed train numbers while preserving their first order', () => {
  assert.deepEqual(
    extractPrefixedTrainList('TS11(Wk), TS03, TS11(Bwk), TS47 and date 26/07/2026'),
    ['11', '03', '47']
  );
});

test('combines movement and PM rows when Azure returns them as separate tables', () => {
  const source = sampleAzureResult().tables[0];
  const movementTable = {
    rowCount: 5,
    columnCount: 10,
    cells: source.cells.filter((entry) => entry.rowIndex <= 4),
  };
  const summaryTable = {
    rowCount: 2,
    columnCount: 10,
    cells: source.cells
      .filter((entry) => entry.rowIndex >= 5)
      .map((entry) => ({ ...entry, rowIndex: entry.rowIndex - 5 })),
  };

  const result = extractMaintenancePlan({ tables: [movementTable, summaryTable] });
  assert.equal(result.recognized, true);
  assert.deepEqual(result.extraction, {
    eveningDate: '26-Jul',
    morningDate: '27-Jul',
    eveningGToC: ['27'],
    morningGToC: ['01'],
    eveningPM: ['32', '33', '11'],
    morningPM: ['37', '06', '30', '32', '19'],
  });
});

test('normalizes numeric and named dates', () => {
  assert.equal(normalizePlanDate('26/07/2026: Evening shift'), '26-Jul');
  assert.equal(normalizePlanDate('2026-07-27'), '27-Jul');
  assert.equal(normalizePlanDate('27 July'), '27-Jul');
});

test('rejects OCR output without the expected structured table headers', () => {
  const result = extractMaintenancePlan({
    tables: [{ rowCount: 1, columnCount: 2, cells: [cell(0, 0, 'Random'), cell(0, 1, 'Text')] }],
  });

  assert.equal(result.recognized, false);
  assert.deepEqual(result.extraction.eveningPM, []);
  assert.deepEqual(result.extraction.morningPM, []);
});

test('marks a partial one-shift result as uncertain', () => {
  const source = sampleAzureResult().tables[0];
  const result = extractMaintenancePlan({
    tables: [{ ...source, rowCount: 6, cells: source.cells.filter((entry) => entry.rowIndex <= 5) }],
  });

  assert.equal(result.recognized, true);
  assert.equal(result.uncertain, true);
  assert.deepEqual(result.diagnostics.missingSummaryShifts, ['morning']);
});

test('maps Azure word confidence to a consumed train cell', () => {
  const fixture = sampleAzureResult();
  const trainCell = fixture.tables[0].cells.find((entry) => entry.rowIndex === 2 && entry.columnIndex === 1);
  trainCell.spans = [{ offset: 100, length: 2 }];
  fixture.pages = [{ words: [{ content: '27', confidence: 0.42, span: { offset: 100, length: 2 } }] }];

  const result = extractMaintenancePlan(fixture);
  assert.equal(result.uncertain, true);
  assert.deepEqual(result.diagnostics.lowConfidenceValues, [
    { label: 'evening G to C train', confidence: 0.42 },
  ]);
});

test('returns a clear configuration error before sending an image', async () => {
  const response = await onRequestPost({
    request: new Request('https://example.test/api/maintenance-image', {
      method: 'POST',
      headers: { Origin: 'https://example.test', 'Sec-Fetch-Site': 'same-origin' },
    }),
    env: {},
  });
  const payload = await response.json();

  assert.equal(response.status, 500);
  assert.match(payload.error, /AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT/);
  assert.match(payload.error, /AZURE_DOCUMENT_INTELLIGENCE_KEY/);
});

test('uses Azure prebuilt-layout and returns the parsed extraction', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    calls.push({ url: String(input), init });
    if (calls.length === 1) {
      return new Response(null, {
        status: 202,
        headers: {
          'Operation-Location': 'https://rail-log-ocr-nazif.cognitiveservices.azure.com/documentintelligence/documentModels/prebuilt-layout/analyzeResults/test-result?api-version=2024-11-30',
        },
      });
    }

    return Response.json({ status: 'succeeded', analyzeResult: sampleAzureResult() });
  };

  try {
    const formData = new FormData();
    formData.append('image', new Blob(['test-image'], { type: 'image/png' }), 'plan.png');
    const response = await onRequestPost({
      request: new Request('https://example.test/api/maintenance-image', {
        method: 'POST',
        headers: { Origin: 'https://example.test', 'Sec-Fetch-Site': 'same-origin' },
        body: formData,
      }),
      env: {
        AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: 'https://rail-log-ocr-nazif.cognitiveservices.azure.com/',
        AZURE_DOCUMENT_INTELLIGENCE_KEY: 'test-key',
      },
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.provider, 'azure-document-intelligence');
    assert.equal(payload.model, 'prebuilt-layout');
    assert.deepEqual(payload.extraction, {
      eveningDate: '26-Jul',
      morningDate: '27-Jul',
      eveningGToC: ['27'],
      morningGToC: ['01'],
      eveningPM: ['32', '33', '11'],
      morningPM: ['37', '06', '30', '32', '19'],
    });
    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /prebuilt-layout:analyze\?api-version=2024-11-30$/);
    assert.equal(calls[0].init.headers['Ocp-Apim-Subscription-Key'], 'test-key');
    assert.equal(new URL(calls[1].url).origin, new URL(calls[0].url).origin);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects cross-origin uploads before calling Azure', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error('should not be called');
  };

  try {
    const response = await onRequestPost({
      request: new Request('https://rail-log.example/api/maintenance-image', {
        method: 'POST',
        headers: { Origin: 'https://attacker.example', 'Sec-Fetch-Site': 'cross-site' },
      }),
      env: {
        AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: 'https://rail-log-ocr-nazif.cognitiveservices.azure.com/',
        AZURE_DOCUMENT_INTELLIGENCE_KEY: 'test-key',
      },
    });

    assert.equal(response.status, 403);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

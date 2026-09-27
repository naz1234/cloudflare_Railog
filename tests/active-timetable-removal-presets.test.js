import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import * as XLSX from 'xlsx';
import * as hdw40 from '../src/lib/trainRemHdw40.js';

const source = readFileSync(new URL('../src/pages/DepotStabling.jsx', import.meta.url), 'utf8');
const functions = [
  'normalizeTimetableType', 'getTimetableTypeLabel', 'detectTimetableTypeFromFileName',
  'getValidTrainRemPresetLabelsForTimetableType', 'getTimetableRecordType',
  'getActiveTimetableParsedData', 'getTimetableRemovalPreset', 'getVisibleTrainRemPresetLabels',
  'getAvailableTrainRemPresetLabel', 'getTrainRemPresetConfig', 'normalizeTrainRemTidValue',
  'isTrainRemLegacyCombinedReferencePreset', 'isTrainRemExtendedCombinedReferencePreset',
  'isTrainRemCombinedReferencePreset', 'getTrainRemReferenceTids',
  'getTrainRemCombinedExtendedLayout', 'getTrainRemAdditionalWestRowCount',
  'getTrainRemAdditionalEastRowCount', 'getTrainRemPresetRowTids', 'indexTrainRemRowsByTid',
  'hasTrainRemRowContent', 'buildTrainRemCombinedWestRows', 'buildTrainRemAdditionalEastRows',
  'normalizeTrainRemRows', 'normalizeTrainRemRowsForPreset', 'emptyTrainRemRows',
  'buildTrainRemRowsFromPreset', 'buildDefaultTrainRemPresetRows', 'normalizeTrainRemPresetRows',
  'normalizeTrainRemSortMode', 'normalizeTrainRemSortModes', 'syncTrainRemActiveRowsToPresetCache',
  'getTrainRemCachedPresetRows', 'buildTrainRemDepotPayload',
  'buildTrainRemRowsFromPresetConfig', 'getTrainRemSavedRowsForTimetable',
  'getDefaultPresetLabelForTimetableType', 'normalizeTrainId', 'padTrainId',
  'collectTrainRemRowsForDepotCopy', 'collectTrainRemReferenceInServiceRows',
  'collectTrainRemMainlineInServiceRows', 'isTrainRemReferenceOnlyIndex',
  'isTrainRemCombinedEastExtraRowIndex', 'getTrainRemCombinedManualRowDepot',
  'mergeTrainRemCombinedMorningReferenceState', 'buildDefaultTrainRemState',
  'getTrainRemTimestampValue', 'getTrainRemStateTimestamp', 'getTrainRemRecordTimestamp',
  'getTrainRemRecordFilledTrainIdCount', 'getLatestTrainRemRecordsByDepot',
  'buildTrainRemStateFromRecords', 'getTrainRemRowForTrain', 'getWestRemovalRowsMap',
  'getTrainRemScheduleMatch',
  'getRequestTid', 'getRequestTiming',
];
const functionText = name => {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n}', start) + 2);
};
const context = {XLSX, Date, Uint8Array, TIMETABLE_PARSE_VERSION:7, ...hdw40};
vm.createContext(context);
vm.runInContext([
  source.slice(source.indexOf('const TIMETABLE_TYPES ='), source.indexOf('const ACTIVE_TIMETABLE_TYPE_KEY')),
  source.slice(source.indexOf('const TRAIN_REM_ROW_COUNTS ='), source.indexOf('function normalizeTrainRemTidValue(')),
  source.slice(source.indexOf('const TID_PRESETS ='), source.indexOf('function emptyTrainRemRows(')),
  source.slice(source.indexOf('function normalizeExcelHeader('), source.indexOf('function normalizeStoredTimetableRecord(')),
  ...functions.map(functionText),
].join('\n'), context);
const plain = value => JSON.parse(JSON.stringify(value));
const makeEntry = (tid,time) => ({tid:String(tid),time,timetableTime:time,label:'PH'});
const record = (type,west=[],east=[]) => ({
  timetableType:type,
  parsedData:{removal:{
    west:{entries:west,presets:{PH:{entries:west,tids:west.map(x=>x.tid)}}},
    east:{entries:east,presets:{PH:{entries:east,tids:east.map(x=>x.tid)}}},
  }},
});
const holiday = record('ph',[
  makeEntry(212,'08:59'),makeEntry(214,'09:05'),makeEntry(221,'23:59'),makeEntry(113,'00:02'),
],[makeEntry(112,'08:59'),makeEntry(121,'23:59'),makeEntry(213,'00:02')]);

test('already uploaded PH records expose only morning and midnight buttons',()=>{
  assert.deepEqual(plain(context.getVisibleTrainRemPresetLabels(holiday,'ph')),['9am','12am']);
  assert.deepEqual(plain(context.getTimetableRemovalPreset(holiday,'west','9am').tids),['212','214']);
  assert.deepEqual(plain(context.getTimetableRemovalPreset(holiday,'west','12am').tids),['221','113']);
  assert.equal(context.getTrainRemPresetConfig('west','7pm',holiday).tids.length,0);
  assert.equal(context.getTrainRemPresetConfig('west','7pm',holiday).source,'uploaded');
  assert.equal(context.getTrainRemPresetConfig('west','PH',holiday).tids.length,0);
});

test('visibility follows the upload and includes periods found only in East Depot',()=>{
  const weekday=record('weekday',[makeEntry(212,'09:00')],[makeEntry(207,'19:44')]);
  assert.deepEqual(plain(context.getVisibleTrainRemPresetLabels(weekday)),['9am','7pm','HDW 40']);
  assert.deepEqual(plain(context.getVisibleTrainRemPresetLabels(record('friday',[makeEntry(102,'00:02')]))),['Fri']);
  assert.deepEqual(plain(context.getVisibleTrainRemPresetLabels(record('saturday',[],[makeEntry(207,'00:02')]))),['Sat']);
  assert.deepEqual(plain(context.getVisibleTrainRemPresetLabels(record('ph'))),[]);
});

test('hidden selections move to an available period and PH migrates to midnight',()=>{
  assert.equal(context.getAvailableTrainRemPresetLabel('7pm',['9am','12am']),'9am');
  assert.equal(context.getAvailableTrainRemPresetLabel('PH',['9am','12am']),'12am');
  assert.equal(context.getAvailableTrainRemPresetLabel('12am',['9am','12am']),'12am');
  assert.equal(context.getAvailableTrainRemPresetLabel('Fri',['Sat']),'Sat');
  assert.equal(context.getAvailableTrainRemPresetLabel('PH',[]),'');
  assert.ok(!context.getVisibleTrainRemPresetLabels(null,'ph').includes('PH'));
});

test('end-of-service classification includes the 23:59 boundary without a false 7pm period',()=>{
  for(const type of ['weekday','ph']) {
    assert.equal(context.classifyRemovalPresetFromTime(type,'23:59'),'12am');
    assert.equal(context.classifyRemovalPresetFromTime(type,'00:00'),'12am');
    assert.equal(context.classifyRemovalPresetFromTime(type,'02:59'),'12am');
    assert.equal(context.classifyRemovalPresetFromTime(type,'19:00'),'7pm');
    assert.equal(context.classifyRemovalPresetFromTime(type,'09:00'),'9am');
  }
});

test('a newly uploaded Excel uses split periods and preserves removal timing',()=>{
  const sheet=XLSX.utils.aoa_to_sheet([
    ['TID','DID','Departure 3A1P1',null,'Arrival 3K1P1',null,null,null,'DID','Departure 3K1P2',null,'Arrival 3A1P2',null,null],
    [null,null,'Scheduled','Actual','Scheduled','Actual','Reason for delay',null,null,'Scheduled','Actual','Scheduled','Actual','Reason for delay'],
    [212,null,null,null,null,null,null,null,1132,null,null,'08:59:24',null,'Removal West Depot S1'],
    [221,null,null,null,null,null,null,null,1132,null,null,'23:59:24',null,'Removal West Depot S1'],
    [121,null,null,null,'23:59:39',null,'WD REMOVAL / MANUAL'],
  ]);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,sheet,'Timetable');
  const parsed=context.parseTimetableWorkbook(XLSX.write(wb,{type:'array',bookType:'xlsx'}),'ph');
  assert.equal(parsed.removal.west.presets['9am'].entries[0].time,'09:03');
  assert.equal(parsed.removal.west.presets['12am'].entries[0].tid,'221');
  assert.equal(parsed.removal.east.presets['12am'].entries[0].tid,'121');
  assert.equal(parsed.removal.west.presets.PH,undefined);
});

test('all 40 closing removals and reserve entries survive cache and payload serialization',()=>{
  const closing=record('ph',Array.from({length:20},(_,i)=>makeEntry(201+i,`00:${String(i*2).padStart(2,'0')}`)),Array.from({length:20},(_,i)=>makeEntry(101+i,`00:${String(i*2).padStart(2,'0')}`)));
  const rows=context.buildTrainRemCombinedWestRows([],'12am',closing);
  assert.equal(rows.length,48);
  rows[0].trainId='05';
  rows[20]={trainId:'30',tid:'999',timing:'01:00',remark:'Manual West'};
  rows[44]={trainId:'31',tid:'998',timing:'01:02',remark:'Manual East'};
  rows[43].trainId='47';
  const saved=context.syncTrainRemActiveRowsToPresetCache({selectedPreset:{west:'12am',east:'12am'},rows:{west:rows,east:[]}});
  const payload=context.buildTrainRemDepotPayload(saved,'west');
  assert.equal(payload.rows.length,48);
  assert.equal(payload.rows[43].tid,'120');
  assert.equal(payload.rows[43].trainId,'47');
  assert.equal(payload.rows[44].remark,'Manual East');
  const restored=context.buildTrainRemCombinedWestRows(plain(payload.rows),'12am',closing);
  assert.deepEqual(plain(restored),plain(rows));
});

test('the preset controls render only the filtered labels in one row',()=>{
  const panel=source.slice(source.indexOf('function TrainRemPanel('),source.indexOf('function TrainRemPanel(')+180000);
  assert.match(panel,/visiblePresetLabels\.map\(\(label\) =>/);
  assert.doesNotMatch(panel,/TID_PRESETS\[depot\]\.slice\(/);
});

test('saved PH train assignments remain available in both replacement periods',()=>{
  const state={selectedPreset:{west:'PH',east:'PH'},presetRows:{west:{PH:[
    {tid:'212',trainId:'14'}, {tid:'221',trainId:'25'}, {tid:'121',trainId:'38'},
  ]},east:{}}};
  const morning=context.getTrainRemSavedRowsForTimetable(state,'west','9am',holiday);
  const midnight=context.getTrainRemSavedRowsForTimetable(state,'west','12am',holiday);
  assert.equal(morning.find(x=>x.tid==='212').trainId,'14');
  assert.equal(midnight.find(x=>x.tid==='221').trainId,'25');
  assert.equal(midnight.find(x=>x.tid==='121').trainId,'38');
  assert.equal(state.presetRows.west.PH.length,3);
  const clearedState={...state,phMigratedPresets:{west:{'12am':true}},presetRows:{west:{...state.presetRows.west,'12am':midnight.map(row=>({...row,trainId:''}))}}};
  const cleared=context.getTrainRemSavedRowsForTimetable(clearedState,'west','12am',holiday);
  assert.ok(cleared.every(row=>!row.trainId), 'cleared assignments must not be restored from the legacy PH cache');
  const saved=context.buildTrainRemDepotPayload(clearedState,'west');
  assert.equal(saved.phMigratedPresets['12am'],true);
});

test('HDW 40 is available only on Weekday, including uploads with no removals', () => {
  assert.deepEqual(plain(context.getVisibleTrainRemPresetLabels(record('weekday'))), ['HDW 40']);
  assert.ok(context.getVisibleTrainRemPresetLabels(null, 'weekday').includes('HDW 40'));
  for (const type of ['friday', 'saturday', 'ph']) {
    assert.ok(!context.getVisibleTrainRemPresetLabels(record(type), type).includes('HDW 40'));
    assert.notEqual(context.getDefaultPresetLabelForTimetableType(type, 'HDW 40'), 'HDW 40');
  }
  assert.equal(context.getDefaultPresetLabelForTimetableType('weekday', 'HDW 40'), 'HDW 40');
});

test('HDW 40 has exactly 40 manual slots, with no scheduled TIDs or times', () => {
  const uploaded = record('weekday', [makeEntry(213, '19:06')], [makeEntry(207, '20:00')]);
  assert.deepEqual(plain(context.getTrainRemPresetConfig('west', 'HDW 40', uploaded)), {
    label: 'HDW 40', tids: [], timeMap: {}, source: 'manual',
  });
  const rows = context.buildTrainRemRowsFromPresetConfig('west', 'HDW 40', [], uploaded);
  assert.equal(rows.length, 40);
  assert.ok(rows.every(row => !row.trainId && !row.tid && !row.timing && !row.remark));
  assert.equal(context.buildTrainRemRowsFromPresetConfig('east', 'HDW 40', [], uploaded).length, 0);
  assert.ok(rows.every((_, i) => !context.isTrainRemReferenceOnlyIndex('west', 'HDW 40', i, uploaded)), 'all manual time fields stay editable');
});

function makeHdwState() {
  const rows = hdw40.normalizeHdw40Rows();
  for (const [index, trainId, timing] of [[0,'01','19:04'], [16,'17','19:30'], [17,'18','19:31'], [19,'20','19:35'], [20,'21','20:00'], [39,'40','20:30']]) {
    rows[index] = { trainId, tid: '', timing, remark: `Manual ${trainId}` };
  }
  return { selectedPreset: { west: 'HDW 40', east: 'HDW 40' }, rows: { west: rows, east: [] } };
}

test('7pm and HDW 40 retain independent rows through switch, save and remote reload', () => {
  let state = context.syncTrainRemActiveRowsToPresetCache(makeHdwState());
  const originalRows = plain(state.rows.west);
  const evening = context.buildTrainRemRowsFromPresetConfig('west', '7pm');
  evening[0].trainId = '47';
  state = context.syncTrainRemActiveRowsToPresetCache({ ...state, selectedPreset: { west: '7pm', east: '7pm' }, rows: { west: evening, east: [] } });
  const restored = context.buildTrainRemRowsFromPresetConfig('west', 'HDW 40', context.getTrainRemCachedPresetRows(state, 'west', 'HDW 40'), record('weekday'));
  assert.deepEqual(plain(restored), originalRows);
  state = context.mergeTrainRemCombinedMorningReferenceState({ ...state, selectedPreset: { west: 'HDW 40', east: 'HDW 40' }, rows: { west: restored, east: [] } });
  const records = ['west', 'east'].map(depot => context.buildTrainRemDepotPayload(state, depot));
  const reloaded = context.buildTrainRemStateFromRecords(records).state;
  assert.deepEqual(plain(reloaded.rows.west), originalRows);
  assert.equal(reloaded.presetRows.west['7pm'][0].trainId, '47');
  assert.equal(reloaded.rows.east.length, 0);
  const cleared = context.syncTrainRemActiveRowsToPresetCache({ ...reloaded, rows: { west: [], east: [] } });
  assert.equal(cleared.presetRows.west['7pm'][0].trainId, '47');
  assert.ok(cleared.presetRows.west['HDW 40'].every(row => !row.trainId && !row.timing));
});

test('manual groups preserve 7pm counts and route depot copy and service totals correctly', () => {
  assert.deepEqual(hdw40.HDW40_GROUPS.map(group => group.count), [17, 3, 20]);
  const state = makeHdwState();
  assert.deepEqual(plain(context.collectTrainRemRowsForDepotCopy(state, 'west').filter(row => row.trainId).map(row => row.trainId)), ['01', '17']);
  assert.deepEqual(plain(context.collectTrainRemRowsForDepotCopy(state, 'east').filter(row => row.trainId).map(row => row.trainId)), ['18', '20']);
  assert.deepEqual(plain(context.collectTrainRemMainlineInServiceRows(state).map(row => row.trainId)), ['21', '40']);
  assert.equal(context.collectTrainRemReferenceInServiceRows(state).length, 6);
  assert.equal(context.getTrainRemRowForTrain(state, '18').depot, 'east');
  assert.equal(context.getTrainRemRowForTrain(state, '21').isTrainRemReferenceOnly, true);
  assert.equal(context.getTrainRemRowForTrain(state, '01').isTrainRemReferenceOnly, false);
  assert.deepEqual([...context.getWestRemovalRowsMap(state).keys()], ['T1', 'T17']);
});

test('normalization strips stale TIDs without altering manual times or remarks', () => {
  const rows = [{ trainId: '02', tid: '213', timing: '19:23', remark: 'Manual wash' }];
  const normalized = context.normalizeTrainRemRowsForPreset(rows, 'west', 'HDW 40', record('weekday'));
  assert.deepEqual(plain(normalized[0]), { trainId: '02', tid: '', timing: '19:23', remark: 'Manual wash' });
  assert.equal(rows[0].tid, '213', 'must not mutate caller state');
  const manualRow = { ...normalized[0], selectedPreset: 'HDW 40' };
  assert.equal(context.getRequestTid({ tid: '999' }, manualRow), '');
  assert.equal(context.getRequestTiming({ time: '23:59' }, manualRow), '19:23');
});

test('HDW removal output uses manual times exactly, separates depots, and excludes off-peak', () => {
  const outputContext = {
    ...context,
    cleanRemovalTime: value => value,
    getRemovalTimeMinutes: value => Number(value.replace(':', '')),
    adjustRemovalOutputTimeForDestinationBlock: () => { throw new Error('Manual times must not be adjusted'); },
    getTrainRemRemovalRequestItem: () => null,
    getTrainRemRemovalRemarkItems: () => [],
    getTrainRemRemovalRemark: row => row.remark,
    getRemovalRemarkFillColor: () => '',
  };
  vm.createContext(outputContext);
  vm.runInContext(functionText('getTrainRemRemovalEntries'), outputContext);
  const state = makeHdwState();
  state.rows.west[1] = { trainId: '02', tid: '', timing: '', remark: '' };
  const west = outputContext.getTrainRemRemovalEntries(state, 'west');
  const east = outputContext.getTrainRemRemovalEntries(state, 'east');
  assert.deepEqual(plain(west.map(row => [row.trainId, row.tid, row.time, row.remark])), [
    ['T01', '', '19:04', 'Manual 01'], ['T17', '', '19:30', 'Manual 17'],
  ]);
  assert.deepEqual(plain(east.map(row => [row.trainId, row.time])), [['T18','19:31'], ['T20','19:35']]);
});

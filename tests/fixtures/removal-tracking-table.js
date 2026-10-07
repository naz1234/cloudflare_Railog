// Manual transcription of the supplied Vehicle ID / Tracking ID screenshot.
export const photographedPairs = [
  ['301', '226'], ['328', '225'], ['327', '227'], ['333', '228'], ['340', '224'],
  ['305', '223'], ['334', ''], ['325', '222'], ['315', '230'], ['331', '229'],
  ['338', '221'], ['313', '121'], ['324', '130'], ['307', '122'], ['317', ''],
  ['329', '123'], ['306', '129'], ['318', '124'], ['341', '128'], ['308', '127'],
  ['322', '125'], ['302', '126'],
  ...['304', '337', '303', '336', '342', '344', '999', '310', '309', '311', '312',
    '314', '316', '320', '321', '323', '326', '330', '339', '343', '345', '346',
    '347', '335', '319', '332'].map((vehicleId) => [vehicleId, '']),
];

export function trackingTableResult(pairs = photographedPairs) {
  return { tables: [{ rowCount: pairs.length + 1, columnCount: 3, cells: [
    ...['Vehicle ID', 'Tracking ID', 'Location'].map((content, columnIndex) => ({ rowIndex: 0, columnIndex, content, kind: 'columnHeader' })),
    ...pairs.flatMap((pair, index) => pair.map((content, columnIndex) => ({ rowIndex: index + 1, columnIndex, content }))),
  ] }] };
}

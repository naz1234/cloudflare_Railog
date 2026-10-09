// Manually transcribed from the reported October 9 screen photos. These are
// representative Azure word polygons, not a claim of a live Azure OCR run.
export const screenPhotoPairs = [
  ['325', ''], ['329', ''], ['331', ''], ['332', ''], ['334', ''],
  ['335', ''], ['336', ''], ['338', ''], ['339', ''], ['340', ''],
  ['342', ''], ['344', ''], ['345', ''], ['346', ''], ['999', ''],
  ['319', '101'], ['309', '102'], ['321', '103'], ['327', '104'], ['326', '105'],
  ['328', '106'], ['347', '107'], ['337', '108'], ['323', '109'], ['320', '110'],
  ['313', '201'], ['343', '202'], ['314', '203'], ['322', '204'], ['312', '205'],
  ['318', '206'], ['341', '207'], ['317', '208'], ['305', '209'], ['330', '210'],
  ['302', '302'], ['311', '311'], ['333', '333'],
];

export const screenWord = (content, x, y, width = 50, height = 14) => ({
  content, confidence: 0.98,
  polygon: [x, y, x + width, y, x + width, y + height, x, y + height],
});

export function screenPhotoResult({ cropped = false, joined = true } = {}) {
  const pairs = cropped ? screenPhotoPairs.slice(7) : screenPhotoPairs;
  const words = pairs.flatMap(([vehicle, tid], index) => {
    const y = 110 + index * 25, skew = index * 0.35;
    return [screenWord(vehicle, 150 + skew, y),
      ...(tid ? [screenWord(tid, 340 + skew, y)] : []),
      screenWord(tid ? 'STATION' : 'Unknown', 540 + skew, y, 100),
      screenWord('No', 810, y, 30)];
  });
  words.push(screenWord('GATE', 40, 430), screenWord('0', 30, 280, 15), screenWord('Alarms', 150, 1150, 70));
  const headings = [screenWord('Vehicle ID', 130, 80, 125), screenWord('Tracking ID', 320, 80, 140), screenWord('Location', 500, 80, 100)];
  if (!cropped) words.push(screenWord('Vehicle', 130, 80, 92), screenWord('ID', 230, 80, 25),
    screenWord('Tracking', 320, 80, 100), screenWord('ID', 435, 80, 25), screenWord('Location', 500, 80, 100));
  return { pages: [{ lines: cropped ? [] : joined ? [screenWord('Vehicle ID Tracking ID Location Outside CBTC', 130, 80, 780)] : headings, words }] };
}

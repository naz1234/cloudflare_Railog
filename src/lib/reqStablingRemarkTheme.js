// Visual treatment only: inspect every displayed remark without changing
// request order, pill colours, train status or export contents.
export function isApuAlarmRemark(label) {
  const normalized = String(label ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  return normalized === 'APU' || /\bAPU ALARM\b/.test(normalized);
}

export function getStablingRemarkTheme(items = []) {
  const labels = (Array.isArray(items) ? items : []).map((item) => {
    const label = typeof item === 'string'
      ? item
      : item?.badgeText || item?.displayType || item?.typeKey || '';
    return String(label).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  });
  // APU / APU ALARM share the warning surface; APU mismatch alone stays unchanged.
  if (labels.some(label => /\bUNFIT\b/.test(label) || isApuAlarmRemark(label))) return 'unfit';
  if (labels.some(label => /\bLEAST PRIORITY\b/.test(label))) return 'least-priority';
  if (labels.some(label => /\b(?:DEEP CLEAN(?:ING)?|DEEPCLEAN)\b/.test(label))) return 'deep-clean';
  return '';
}

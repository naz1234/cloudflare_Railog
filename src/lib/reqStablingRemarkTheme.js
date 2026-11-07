// Visual treatment only: inspect every displayed remark without changing
// request order, pill colours, train status or export contents.
export function isApuAlarmRemark(label) {
  const normalized = String(label ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  return normalized === 'APU' || /\bAPU ALARM\b/.test(normalized);
}

export function isFailureWarningRemark(label) {
  const normalized = String(label ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  return isApuAlarmRemark(normalized)
    || /\bAPU (?:MIS|MISMATCH|MISSMATCH)\b/.test(normalized)
    || /\b(?:CC (?:TECHNICAL|TEHNICAL)|(?:TECHNICAL|TEHNICAL) FAILURE)\b/.test(normalized);
}

export function getStablingRemarkTheme(items = []) {
  const labels = (Array.isArray(items) ? items : []).map((item) => {
    const label = typeof item === 'string'
      ? item
      : item?.badgeText || item?.displayType || item?.typeKey || '';
    return String(label).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  });
  // Requested failure/APU remarks share the visual surface, not train fitness.
  if (labels.some(label => /\bUNFIT\b/.test(label) || isFailureWarningRemark(label))) return 'unfit';
  if (labels.some(label => /\bLEAST PRIORITY\b/.test(label))) return 'least-priority';
  if (labels.some(label => /\b(?:DEEP CLEAN(?:ING)?|DEEPCLEAN)\b/.test(label))) return 'deep-clean';
  return '';
}

const MANUAL_FLOW_MARKER = '    const manualFlowSteps = [';
const ALL_FLOW_MARKER = '    const allFlowSteps = isAutomatic ? automaticFlowSteps : manualFlowSteps;';
const CMMS_MAINT_URL = 'https://login.flow-metro.com/adfs/ls/IdpInitiatedSignon.aspx?RelayState=RPID%3Dhttps%253A%252F%252Fcmms.flow-metro.com%26RelayState%3Dhttps%253A%252F%252Fcmms.flow-metro.com%252Fmaximo%252Fui%252Fmaximo.jsp';

function replaceRequired(source, search, replacement, label) {
  const firstIndex = source.indexOf(search);
  if (firstIndex < 0 || source.indexOf(search, firstIndex + search.length) >= 0) {
    throw new Error(`[manual-next-wash-maint] Unable to update ${label}.`);
  }
  return source.slice(0, firstIndex) + replacement + source.slice(firstIndex + search.length);
}

function updateManualNextWash(source) {
  const manualStart = source.indexOf(MANUAL_FLOW_MARKER);
  const manualEnd = source.indexOf(ALL_FLOW_MARKER, manualStart + MANUAL_FLOW_MARKER.length);
  if (manualStart < 0 || manualEnd < 0) {
    throw new Error('[manual-next-wash-maint] Unable to locate the Manual Area flow.');
  }

  const manualFlow = source.slice(manualStart, manualEnd);
  const original = `      {
        key: "nextWashText",
        label: "Next Wash Optional",
        optional: true,`;
  const replacement = `      {
        key: "nextWashText",
        persistentAttention: true,
        hideCurrentBadge: true,
        label: "Next Wash (update status to MAINT)",
        actionHref: "${CMMS_MAINT_URL}",
        actionLabel: "Update MAINT",
        actionTitle: "Open CMMS to update status to MAINT",`;
  const updatedFlow = replaceRequired(manualFlow, original, replacement, 'the Manual Area Next Wash step');

  return source.slice(0, manualStart) + updatedFlow + source.slice(manualEnd);
}

export default function manualNextWashMaintPlugin() {
  return {
    name: 'railog-manual-next-wash-maint',
    enforce: 'pre',
    transform(source, id) {
      if (!id.replace(/\\/g, '/').endsWith('/src/pages/DepotStabling.jsx')) {
        return null;
      }

      return { code: updateManualNextWash(source), map: null };
    },
  };
}

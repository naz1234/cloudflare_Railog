const AUTOMATIC_FLOW_MARKER = '    const automaticFlowSteps = [';
const MANUAL_FLOW_MARKER = '    const manualFlowSteps = [';

function replaceRequired(source, search, replacement, label) {
  const firstIndex = source.indexOf(search);
  if (firstIndex < 0 || source.indexOf(search, firstIndex + search.length) >= 0) {
    throw new Error(`[automatic-parking-pst] Unable to update ${label}.`);
  }
  return source.slice(0, firstIndex) + replacement + source.slice(firstIndex + search.length);
}

function updateAutomaticParkingFlow(source) {
  let code = replaceRequired(
    source,
    '    const automaticStablingReady = automaticTrLocalizedReady && Boolean(modeForm.automaticStablingRoad);',
    '    const automaticParkingReady = Boolean(modeForm.automaticStablingRoad);',
    'Parking Location readiness',
  );

  code = replaceRequired(
    code,
    '    const automaticCompletedDcReady = automaticStablingReady && Boolean(String(modeForm.completedByDc || "").trim()) && isTp1FlowFieldSettled("completedByDc");',
    '    const automaticCompletedDcReady = automaticTrLocalizedReady && Boolean(String(modeForm.completedByDc || "").trim()) && isTp1FlowFieldSettled("completedByDc");',
    'Automatic Area required flow dependency',
  );

  const automaticStart = code.indexOf(AUTOMATIC_FLOW_MARKER);
  const manualStart = code.indexOf(MANUAL_FLOW_MARKER, automaticStart + AUTOMATIC_FLOW_MARKER.length);
  if (automaticStart < 0 || manualStart < 0) {
    throw new Error('[automatic-parking-pst] Unable to locate the Automatic Area flow.');
  }

  let automaticFlow = code.slice(automaticStart, manualStart);
  automaticFlow = replaceRequired(
    automaticFlow,
    `      {
        key: "automaticStablingRoad",
        label: "Parking Location",
        visible: automaticTrLocalizedReady,
        complete: automaticStablingReady,`,
    `      {
        key: "automaticStablingRoad",
        label: "Parking Location",
        optional: true,
        visible: automaticCmmsReady,
        complete: automaticParkingReady,`,
    'Parking Location placement',
  );

  automaticFlow = replaceRequired(
    automaticFlow,
    `      {
        key: "completedByDc",
        label: "Completed By DC",
        visible: automaticStablingReady,`,
    `      {
        key: "completedByDc",
        label: "Completed By DC",
        visible: automaticTrLocalizedReady,`,
    'Completed By DC visibility',
  );

  return code.slice(0, automaticStart) + automaticFlow + code.slice(manualStart);
}

export default function automaticParkingPstPlugin() {
  return {
    name: 'railog-automatic-parking-pst',
    enforce: 'pre',
    transform(source, id) {
      if (!id.replace(/\\/g, '/').endsWith('/src/pages/DepotStabling.jsx')) {
        return null;
      }

      return { code: updateAutomaticParkingFlow(source), map: null };
    },
  };
}

const AUTOMATIC_FLOW_MARKER = '    const automaticFlowSteps = [';
const MANUAL_FLOW_MARKER = '    const manualFlowSteps = [';
const CMMS_OPER_URL = 'https://login.flow-metro.com/adfs/ls/IdpInitiatedSignon.aspx?RelayState=RPID%3Dhttps%253A%252F%252Fcmms.flow-metro.com%26RelayState%3Dhttps%253A%252F%252Fcmms.flow-metro.com%252Fmaximo%252Fui%252Fmaximo.jsp';

function replaceRequired(source, search, replacement, label) {
  const firstIndex = source.indexOf(search);
  if (firstIndex < 0 || source.indexOf(search, firstIndex + search.length) >= 0) {
    throw new Error(`[automatic-next-wash-oper] Unable to update ${label}.`);
  }
  return source.slice(0, firstIndex) + replacement + source.slice(firstIndex + search.length);
}

function updateAutomaticNextWash(source) {
  const automaticStart = source.indexOf(AUTOMATIC_FLOW_MARKER);
  const manualStart = source.indexOf(MANUAL_FLOW_MARKER, automaticStart + AUTOMATIC_FLOW_MARKER.length);
  if (automaticStart < 0 || manualStart < 0) {
    throw new Error('[automatic-next-wash-oper] Unable to locate the Automatic Area flow.');
  }

  const automaticFlow = source.slice(automaticStart, manualStart);
  const original = `      {
        key: "nextWashText",
        label: "Next Wash Optional",
        optional: true,
        visible: automaticCmmsReady,`;
  const replacement = `      {
        key: "nextWashText",
        label: (
          <a
            href="${CMMS_OPER_URL}"
            target="_blank"
            rel="noopener noreferrer"
            className="truncate underline decoration-current/60 underline-offset-2 hover:text-[#7ab7ff]"
            title="Open CMMS to update status to OPER"
          >
            Next Wash (update status to OPER)
          </a>
        ),
        visible: automaticCmmsReady,`;
  const updatedFlow = replaceRequired(automaticFlow, original, replacement, 'the Automatic Area Next Wash step');

  return source.slice(0, automaticStart) + updatedFlow + source.slice(manualStart);
}

export default function automaticNextWashOperPlugin() {
  return {
    name: 'railog-automatic-next-wash-oper',
    enforce: 'pre',
    transform(source, id) {
      if (!id.replace(/\\/g, '/').endsWith('/src/pages/DepotStabling.jsx')) {
        return null;
      }

      return { code: updateAutomaticNextWash(source), map: null };
    },
  };
}

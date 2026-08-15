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
        persistentAttention: true,
        hideCurrentBadge: true,
        label: "Next Wash (update status to OPER)",
        actionHref: "${CMMS_OPER_URL}",
        actionLabel: "Update OPER",
        actionTitle: "Open CMMS to update status to OPER",
        visible: automaticCmmsReady,`;
  const updatedFlow = replaceRequired(automaticFlow, original, replacement, 'the Automatic Area Next Wash step');

  return source.slice(0, automaticStart) + updatedFlow + source.slice(manualStart);
}

function updatePersistentAttentionRendering(source) {
  let updatedSource = replaceRequired(
    source,
    `      const isCurrent = !step.optional && !step.complete && currentRequiredStep?.key === step.key;
      const cardState = step.complete ? "is-complete" : isCurrent ? "is-current" : "is-pending";`,
    `      const isCurrent = !step.optional && !step.complete && currentRequiredStep?.key === step.key;
      const isAttentionStep = Boolean(step.persistentAttention) || isCurrent;
      const cardState = isAttentionStep ? "is-current" : step.complete ? "is-complete" : "is-pending";`,
    'the persistent attention card state',
  );

  updatedSource = replaceRequired(
    updatedSource,
    `          data-movement-step-state={step.complete ? "complete" : isCurrent ? "current" : "pending"}
          className={\`theme-tp1-flow-step \${cardState} rounded-xl border p-2 transition-all focus-within:ring-2 focus-within:ring-[#4f8ef7]/55\`}`,
    `          data-movement-step-state={isAttentionStep ? "current" : step.complete ? "complete" : "pending"}
          className={\`theme-tp1-flow-step \${cardState} rounded-xl border p-2 transition-all focus-within:ring-2 focus-within:ring-[#4f8ef7]/55\`}`,
    'the persistent attention card attributes',
  );

  updatedSource = replaceRequired(
    updatedSource,
    `            borderColor: isCurrent ? "#4f8ef7" : "#31516b",
            background: step.complete
              ? \`linear-gradient(135deg, \${accent}08, #071b2d 86%)\`
              : isCurrent
              ? "linear-gradient(135deg, rgba(79,142,247,0.18), #061827 82%)"
              : "#071b2d",
            boxShadow: step.complete
              ? "inset 0 1px 0 rgba(255,255,255,0.05)"
              : isCurrent
              ? "0 0 0 1px rgba(79,142,247,0.48), 0 0 18px rgba(79,142,247,0.30), inset 0 1px 0 rgba(255,255,255,0.06)"
              : "inset 0 1px 0 rgba(255,255,255,0.03)",`,
    `            borderColor: isAttentionStep ? "#4f8ef7" : "#31516b",
            background: isAttentionStep
              ? "linear-gradient(135deg, rgba(79,142,247,0.18), #061827 82%)"
              : step.complete
              ? \`linear-gradient(135deg, \${accent}08, #071b2d 86%)\`
              : "#071b2d",
            boxShadow: isAttentionStep
              ? "0 0 0 1px rgba(79,142,247,0.48), 0 0 18px rgba(79,142,247,0.30), inset 0 1px 0 rgba(255,255,255,0.06)"
              : step.complete
              ? "inset 0 1px 0 rgba(255,255,255,0.05)"
              : "inset 0 1px 0 rgba(255,255,255,0.03)",`,
    'the persistent attention card styling',
  );

  updatedSource = replaceRequired(
    updatedSource,
    `            ) : isCurrent ? (
              <span className="theme-tp1-current-step-badge shrink-0 rounded-full border border-[#4f8ef7]/70 bg-[#123f73]/70 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.09em] text-[#7ab7ff]">`,
    `            ) : isCurrent && !step.hideCurrentBadge ? (
              <span className="theme-tp1-current-step-badge shrink-0 rounded-full border border-[#4f8ef7]/70 bg-[#123f73]/70 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.09em] text-[#7ab7ff]">`,
    'the optional Current badge',
  );

  updatedSource = replaceRequired(
    updatedSource,
    `          {step.render()}
        </div>`,
    `          {step.actionHref ? (
            <div className="theme-tp1-next-wash-content mt-1 flex min-w-0 items-center gap-3 pt-2">
              <div className="min-w-0 flex-1">{step.render()}</div>
              <a
                href={step.actionHref}
                target="_blank"
                rel="noopener noreferrer"
                className="theme-tp1-next-wash-link theme-tp1-next-wash-action-pill inline-flex shrink-0 items-center justify-center gap-2 rounded-full border px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.08em]"
                title={step.actionTitle}
              >
                {step.actionLabel}
                <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 3h7v7" />
                  <path d="M10 14 21 3" />
                  <path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6" />
                </svg>
              </a>
            </div>
          ) : step.render()}
        </div>`,
    'the Next Wash action row',
  );

  return updatedSource;
}

export default function automaticNextWashOperPlugin() {
  return {
    name: 'railog-automatic-next-wash-oper',
    enforce: 'pre',
    transform(source, id) {
      if (!id.replace(/\\/g, '/').endsWith('/src/pages/DepotStabling.jsx')) {
        return null;
      }

      const updatedSource = updateAutomaticNextWash(source);
      return { code: updatePersistentAttentionRendering(updatedSource), map: null };
    },
  };
}

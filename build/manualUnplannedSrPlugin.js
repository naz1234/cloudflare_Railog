function replaceRequired(source, pattern, replacement, label) {
  const next = source.replace(pattern, replacement);
  if (next === source) {
    throw new Error(`[manual-unplanned-sr] Unable to update ${label} in DepotStabling.jsx`);
  }
  return next;
}

export default function manualUnplannedSrPlugin() {
  return {
    name: 'railog-manual-unplanned-sr',
    enforce: 'pre',
    transform(source, id) {
      if (!id.replace(/\\/g, '/').endsWith('/src/pages/DepotStabling.jsx')) {
        return null;
      }

      let code = source;

      code = replaceRequired(
        code,
        /^(\s*)cmmsNumber: "",$/gm,
        '$1cmmsNumber: "",\n$1srNumber: "",',
        'SR form state'
      );

      code = replaceRequired(
        code,
        /    const cmmsNumber = String\(form\.cmmsNumber \|\| ""\)\.replace\(\/\[\^0-9A-Za-z\/-\]\/g, ""\)\.trim\(\);/,
        `    const cmmsNumber = String(form.cmmsNumber || "").replace(/[^0-9A-Za-z/-]/g, "").trim();
    const srNumber = String(form.srNumber || "").replace(/[^0-9A-Za-z/-]/g, "").trim();
    const isUnplannedManualMovement = movementType === "manual" && String(form.planStatus || "").toLowerCase() === "unplanned";`,
        'SR output values'
      );

      code = replaceRequired(
        code,
        /      cmmsNumber,\r?\n      l3ReportUpdatedToMaintenance:/,
        `      cmmsNumber,
      srNumber: isUnplannedManualMovement ? srNumber : "",
      l3ReportUpdatedToMaintenance:`,
        'Manual Area handover log text'
      );

      code = replaceRequired(
        code,
        /      cmmsNumber: form\.cmmsNumber \|\| "",/,
        `      cmmsNumber: form.cmmsNumber || "",
      srNumber: form.srNumber || "",`,
        'saved SR value'
      );

      code = replaceRequired(
        code,
        /    const manualCmmsReady = ([^\r\n]+);/,
        `    const manualCmmsReady = $1;
    const manualSrRequired = String(modeForm.planStatus || "").toLowerCase() === "unplanned";
    const manualSrReady = manualCmmsReady && (!manualSrRequired || (Boolean(String(modeForm.srNumber || "").trim()) && isTp1FlowFieldSettled("srNumber")));`,
        'Manual Area SR readiness'
      );

      code = replaceRequired(
        code,
        /      \{\r?\n        key: "nextWashText",\r?\n        label: "Next Wash Optional",\r?\n        optional: true,\r?\n        visible: manualCmmsReady,/,
        `      {
        key: "srNumber",
        label: "SR Number :",
        applicable: manualSrRequired,
        visible: manualCmmsReady && manualSrRequired,
        complete: manualSrReady,
        render: () => (
          <input
            type="text"
            value={modeForm.srNumber || ""}
            onFocus={() => focusFlowInput(getTp1FlowInputKey("srNumber", movementType))}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            onChange={(e) => {
              updateTp1ModeForm(movementType, "srNumber", e.target.value.replace(/[^0-9A-Za-z/-]/g, ""));
              scheduleFlowInputSettled(getTp1FlowInputKey("srNumber", movementType));
            }}
            onBlur={() => blurFlowInput(getTp1FlowInputKey("srNumber", movementType))}
            placeholder="Enter SR number"
            className={inputClass}
          />
        ),
      },
      {
        key: "nextWashText",
        label: "Next Wash Optional",
        optional: true,
        visible: manualSrReady,`,
        'Manual Area SR input step'
      );

      return { code, map: null };
    },
  };
}

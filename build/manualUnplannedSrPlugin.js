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
        /      if \(movementType === "manual" && !cmmsNumber\) missing\.push\("CMMS Number"\);/,
        `      if (movementType === "manual" && !cmmsNumber) missing.push("CMMS Number");
      if (isUnplannedManualMovement && !srNumber) missing.push("SR Number");`,
        'SR validation'
      );

      code = replaceRequired(
        code,
        /        \.\.\.\(cmmsNumber \? \[`\$\{toManual\} hrs – CMMS Hand Over Completed\. Handover #\$\{cmmsNumber\}\.`\] : \[\]\),/,
        '        ...(cmmsNumber ? [`${toManual} hrs – CMMS Hand Over Completed. Handover #${cmmsNumber}${isUnplannedManualMovement ? ` with SR #${srNumber}` : ""}.`] : []),',
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
        /      \{\r?\n        key: "nextWashText",\r?\n        label: "Next Wash Optional",\r?\n        visible: manualCmmsReady,/,
        `      {
        key: "srNumber",
        label: "SR Number :",
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
        visible: manualSrReady,`,
        'Manual Area SR input step'
      );

      code = replaceRequired(
        code,
        /const tp1RequiredReady = isAutomatic \? automaticCmmsReady : manualCmmsReady;/,
        'const tp1RequiredReady = isAutomatic ? automaticCmmsReady : manualSrReady;',
        'Manual Area Add to Log readiness'
      );

      const tp1StepCardStart = code.indexOf('const renderTp1FlowStepCard');
      const tp1StepCardEnd = code.indexOf('const renderTp1FlowRows', tp1StepCardStart);
      if (tp1StepCardStart < 0 || tp1StepCardEnd < 0) {
        throw new Error('[manual-unplanned-sr] Unable to locate the TP1 flow step renderer');
      }

      const tp1StepCard = code.slice(tp1StepCardStart, tp1StepCardEnd);
      const animatedTp1StepCard = replaceRequired(
        tp1StepCard,
        /<span className="truncate text-white">\{step\.label\}<\/span>/,
        '<span className={`truncate text-white ${step.key === "srNumber" && !step.complete ? "movement-flow-sr-label-attention" : ""}`}>{step.label}</span>',
        'animated SR Number label'
      );
      code = code.slice(0, tp1StepCardStart) + animatedTp1StepCard + code.slice(tp1StepCardEnd);

      return { code, map: null };
    },
  };
}

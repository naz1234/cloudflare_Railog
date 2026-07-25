function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findFlowStep(source, key, fromIndex = 0) {
  const keyPattern = new RegExp(`^([ \\t]*)key: "${escapeRegExp(key)}",\\r?$`, 'gm');
  keyPattern.lastIndex = Math.max(0, fromIndex);
  const keyMatch = keyPattern.exec(source);
  if (!keyMatch) return null;

  const keyIndent = keyMatch[1];
  const objectIndent = keyIndent.length >= 2 ? keyIndent.slice(0, -2) : '';
  const objectNeedle = `${objectIndent}{`;
  const start = source.lastIndexOf(objectNeedle, keyMatch.index);
  if (start < 0) return null;

  const nextStepPattern = new RegExp(
    `^${escapeRegExp(objectIndent)}\\{\\r?\\n${escapeRegExp(keyIndent)}key: "`,
    'gm',
  );
  nextStepPattern.lastIndex = keyMatch.index + keyMatch[0].length;
  const nextStep = nextStepPattern.exec(source);
  if (!nextStep) return null;

  return {
    start,
    end: nextStep.index,
    block: source.slice(start, nextStep.index),
    keyIndent,
    objectIndent,
  };
}

function lineExpression(block, indent, property) {
  const pattern = new RegExp(
    `^${escapeRegExp(indent)}${escapeRegExp(property)}:\\s*([^,\\r\\n]+),\\r?$`,
    'm',
  );
  return pattern.exec(block)?.[1]?.trim() || '';
}

function replaceStepVisible(block, indent, expression) {
  const pattern = new RegExp(
    `^(${escapeRegExp(indent)}visible:\\s*)[^,\\r\\n]+(,\\r?)$`,
    'm',
  );
  if (!pattern.test(block)) {
    throw new Error('[automatic-excel-completed-by] Unable to update CMMS visibility.');
  }
  return block.replace(pattern, `$1${expression}$2`);
}

function removeCompletedByFlowStep(source) {
  const completedStep = findFlowStep(source, 'completedByDc');
  if (!completedStep) {
    throw new Error('[automatic-excel-completed-by] Unable to find the Completed By DC flow step.');
  }

  const prerequisite = lineExpression(completedStep.block, completedStep.keyIndent, 'visible');
  const completedReady = lineExpression(completedStep.block, completedStep.keyIndent, 'complete');
  if (!prerequisite || !completedReady) {
    throw new Error('[automatic-excel-completed-by] Unable to read the Completed By DC flow dependencies.');
  }

  let code = source.slice(0, completedStep.start) + source.slice(completedStep.end);

  const cmmsStep = findFlowStep(code, 'cmmsNumber', completedStep.start);
  if (!cmmsStep) {
    throw new Error('[automatic-excel-completed-by] Unable to find the Automatic Area CMMS flow step.');
  }
  const updatedCmmsBlock = replaceStepVisible(cmmsStep.block, cmmsStep.keyIndent, prerequisite);
  code = code.slice(0, cmmsStep.start) + updatedCmmsBlock + code.slice(cmmsStep.end);

  const cmmsReadyPattern = /^(\s*const\s+automaticCmmsReady\s*=\s*)([^;\r\n]+);\r?$/m;
  const cmmsReadyMatch = cmmsReadyPattern.exec(code);
  if (!cmmsReadyMatch) {
    throw new Error('[automatic-excel-completed-by] Unable to find Automatic Area CMMS readiness.');
  }
  const updatedReadyExpression = cmmsReadyMatch[2].includes(completedReady)
    ? cmmsReadyMatch[2].replace(completedReady, prerequisite)
    : cmmsReadyMatch[2];
  code = code.replace(cmmsReadyPattern, `$1${updatedReadyExpression};`);

  if (/^[A-Za-z_$][\w$]*$/.test(completedReady)) {
    const completedReadyPattern = new RegExp(
      `^\\s*const\\s+${escapeRegExp(completedReady)}\\s*=\\s*[^;\\r\\n]+;\\r?\\n?`,
      'm',
    );
    code = code.replace(completedReadyPattern, '');
  }

  return code;
}

function replaceExcelHandler(source) {
  const startMarker = '  const handleDownloadTp1AutomaticExcel = () => {';
  const endMarker = '  const renderMovementLogLine =';
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) {
    throw new Error('[automatic-excel-completed-by] Unable to update the Automatic Area Excel handler.');
  }

  const replacement = `  const handleDownloadTp1AutomaticExcel = () => {
    const exportLines = buildTp1AutomaticPSTExportLines(tp1Entries);
    if (!exportLines.length) {
      alert("No Automatic Area PST or Train Prep log to export yet.");
      return;
    }

    const previousCompletedByDc = String(getTp1ModeForm("automatic").completedByDc || "").trim();
    const promptedCompletedByDc = window.prompt("Completed by who?", previousCompletedByDc);
    if (promptedCompletedByDc === null) return;

    const completedByDc = String(promptedCompletedByDc || "").trim();
    if (!completedByDc) {
      alert("Please enter Completed By DC name before downloading the Excel file.");
      return;
    }

    updateTp1ModeForm("automatic", "completedByDc", completedByDc);
    downloadTp1AutomaticExcelExport(tp1Entries, completedByDc);
  };
`;

  return source.slice(0, start) + replacement + source.slice(end);
}

export default function automaticExcelCompletedByPlugin() {
  return {
    name: 'railog-automatic-excel-completed-by',
    enforce: 'pre',
    transform(source, id) {
      if (!id.replace(/\\/g, '/').endsWith('/src/pages/DepotStabling.jsx')) {
        return null;
      }

      let code = removeCompletedByFlowStep(source);
      code = replaceExcelHandler(code);
      return { code, map: null };
    },
  };
}

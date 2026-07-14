function replaceRequired(source, pattern, replacement, label) {
  const next = source.replace(pattern, replacement);
  if (next === source) {
    throw new Error(`[manual-arrival-time] Unable to update ${label} in DepotStabling.jsx`);
  }
  return next;
}

export default function manualArrivalTimePlugin() {
  return {
    name: 'railog-manual-arrival-time',
    enforce: 'pre',
    transform(source, id) {
      if (!id.replace(/\\/g, '/').endsWith('/src/pages/DepotStabling.jsx')) {
        return null;
      }

      let code = source;

      code = replaceRequired(
        code,
        /^\s*if\s*\(movementType\s*===\s*"manual"\s*&&\s*!isCompleteMovementTimeInput\(tp1Form\.fromTp1\)\)\s*missing\.push\("Time start moving from TP1 \(HH:MM\)"\);\r?\n/m,
        '',
        'manual From TP1 validation'
      );

      code = replaceRequired(
        code,
        /\s*const manualFromTp1Ready\s*=\s*manualShunterReady\s*&&\s*(?:Boolean|isCompleteMovementTimeInput)\(tp1Form\.fromTp1\);\r?\n\s*const manualToManualReady\s*=\s*manualFromTp1Ready\s*&&\s*(?:Boolean|isCompleteMovementTimeInput)\(tp1Form\.toManual\);/,
        `
    const manualToManualReady = manualShunterReady && isCompleteMovementTimeInput(tp1Form.toManual);`,
        'manual arrival readiness'
      );

      code = replaceRequired(
        code,
        /    const fromTp1 = tp1Form\.fromTp1 \|\| "18:30";\r?\n    const toManual = tp1Form\.toManual \|\| "18:35";/,
        `    const toManual = tp1Form.toManual || "18:35";
    const fromTp1 = (() => {
      const match = String(toManual || "").trim().match(/^(\\d{1,2}):(\\d{2})$/);
      if (!match) return "";
      const hours = Number(match[1]);
      const minutes = Number(match[2]);
      if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return "";
      const totalMinutes = (hours * 60 + minutes - 3 + 24 * 60) % (24 * 60);
      return String(Math.floor(totalMinutes / 60)).padStart(2, "0") + ":" + String(totalMinutes % 60).padStart(2, "0");
    })();`,
        'manual preview departure calculation'
      );

      code = replaceRequired(
        code,
        /      \{\r?\n        key: "fromTp1",\r?\n        label: "Time start moving from TP1",\r?\n        visible: manualShunterReady,\r?\n        complete: manualFromTp1Ready,\r?\n        render: \(\) => renderTp1TimeInput\("fromTp1"\),\r?\n      \},\r?\n      \{\r?\n        key: "toManual",\r?\n        label: "Time arrival to Manual Area",\r?\n        visible: manualFromTp1Ready,\r?\n        complete: manualToManualReady,\r?\n        render: \(\) => renderTp1TimeInput\("toManual"\),\r?\n      \},/,
        `      {
        key: "toManual",
        label: "Time arrival to Manual Area",
        visible: manualShunterReady,
        complete: manualToManualReady,
        render: () => renderTp1TimeInput("toManual"),
      },`,
        'manual flow time fields'
      );

      code = code.replace(
        'Fill From TP1 + to Manual',
        'Enter Manual Area arrival time'
      );

      return { code, map: null };
    },
  };
}

export default function manualArrivalTimePlugin() {
  return {
    name: 'railog-manual-arrival-time-match-check',
    enforce: 'pre',
    transform(source, id) {
      if (!id.replace(/\\/g, '/').endsWith('/src/pages/DepotStabling.jsx')) {
        return null;
      }

      const validationPattern = /^\s*if\s*\(movementType\s*===\s*"manual"\s*&&\s*!isCompleteMovementTimeInput\(tp1Form\.fromTp1\)\)\s*missing\.push\("Time start moving from TP1 \(HH:MM\)"\);\r?\n/m;
      const previewPattern = /    const fromTp1 = tp1Form\.fromTp1 \|\| "18:30";\r?\n    const toManual = tp1Form\.toManual \|\| "18:35";/;

      if (!validationPattern.test(source) || !previewPattern.test(source)) {
        throw new Error('[manual-arrival-time] Validation or preview source pattern did not match.');
      }

      return null;
    },
  };
}

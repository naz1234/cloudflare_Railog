export default function manualArrivalTimePlugin() {
  return {
    name: 'railog-manual-arrival-time-validation-check',
    enforce: 'pre',
    transform(source, id) {
      if (!id.replace(/\\/g, '/').endsWith('/src/pages/DepotStabling.jsx')) {
        return null;
      }

      const validationPattern = /^\s*if\s*\(movementType\s*===\s*"manual"\s*&&\s*!isCompleteMovementTimeInput\(tp1Form\.fromTp1\)\)\s*missing\.push\("Time start moving from TP1 \(HH:MM\)"\);\r?\n/m;

      if (!validationPattern.test(source)) {
        throw new Error('[manual-arrival-time] Validation source pattern did not match.');
      }

      return null;
    },
  };
}

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
        /\nfunction TrainMovementContent\(\) \{/,
        `
function subtractThreeMinutesFromHHMM(value = "") {
  const digits = String(value || "").replace(/\\D/g, "").slice(0, 4);
  if (digits.length !== 4) return "";

  const hours = Number(digits.slice(0, 2));
  const minutes = Number(digits.slice(2, 4));
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return "";

  const totalMinutes = (hours * 60 + minutes - 3 + 24 * 60) % (24 * 60);
  return String(Math.floor(totalMinutes / 60)).padStart(2, "0") + String(totalMinutes % 60).padStart(2, "0");
}

function TrainMovementContent() {`,
        'manual arrival time helper'
      );

      code = replaceRequired(
        code,
        /\n  const captureMovementScrollPosition = \(\) => \{/,
        `
  useEffect(() => {
    if (String(tp1Form.movementType || "").toLowerCase() !== "manual") return;

    const derivedFromTp1 = subtractThreeMinutesFromHHMM(tp1Form.toManual);
    if (tp1Form.fromTp1 === derivedFromTp1) return;

    setTp1Form((previous) => ({
      ...previous,
      fromTp1: derivedFromTp1,
    }));
  }, [tp1Form.movementType, tp1Form.toManual, tp1Form.fromTp1]);

  const captureMovementScrollPosition = () => {`,
        'automatic From TP1 form value'
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

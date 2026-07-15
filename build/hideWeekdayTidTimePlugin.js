// Weekday insertion cards keep their stored timing but hide the visible TIME row for active TIDs 101–120 and 201–220.
function replaceRequired(source, pattern, replacement, label) {
  const next = source.replace(pattern, replacement);
  if (next === source) {
    throw new Error(`[hide-weekday-tid-time] Unable to update ${label} in DepotStabling.jsx`);
  }
  return next;
}

export default function hideWeekdayTidTimePlugin() {
  return {
    name: 'railog-hide-weekday-tid-time',
    enforce: 'pre',
    transform(source, id) {
      if (!id.replace(/\\/g, '/').endsWith('/src/pages/DepotStabling.jsx')) {
        return null;
      }

      let code = source;

      code = replaceRequired(
        code,
        /  const useLargerWeekdayAssistRemark = Boolean\(\r?\n    isWeekdayActive && \["Early Rem", "Late Rem", "ED", "ED \(7pm\)"\]\.includes\(insertedTidAssistRemark\)\r?\n  \);/,
        `  const useLargerWeekdayAssistRemark = Boolean(
    isWeekdayActive && ["Early Rem", "Late Rem", "ED", "ED (7pm)"].includes(insertedTidAssistRemark)
  );
  const insertedTidNumber = Number.parseInt(String(insertedTid || ""), 10);
  const hideWeekdayActiveTidTime = Boolean(
    isWeekdayActive && (
      (insertedTidNumber >= 101 && insertedTidNumber <= 120) ||
      (insertedTidNumber >= 201 && insertedTidNumber <= 220)
    )
  );`,
        'weekday TID time visibility rule'
      );

      let timePanelMatches = 0;
      code = code.replace(
        /(<div className="mb-1 text-center text-\[11px\] font-normal leading-tight text-white">TID \{insertedTid\}<\/div>\r?\n)(\s*)<div className="grid w-full grid-cols-\[34px_minmax\(0,1fr\)\] items-center gap-x-1 gap-y-0\.5">/g,
        (_match, tidHeading, indentation) => {
          timePanelMatches += 1;
          return `${tidHeading}${indentation}<div\n${indentation}  className="grid w-full grid-cols-[34px_minmax(0,1fr)] items-center gap-x-1 gap-y-0.5"\n${indentation}  style={hideWeekdayActiveTidTime ? { display: "none" } : undefined}\n${indentation}>`;
        }
      );

      if (timePanelMatches === 0) {
        throw new Error('[hide-weekday-tid-time] Unable to locate active TID time panels in DepotStabling.jsx');
      }

      return { code, map: null };
    },
  };
}

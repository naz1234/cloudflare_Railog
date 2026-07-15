// Weekday insertion cards keep their stored timing but hide the visible TIME row only for weekday-specific active TID remarks.
export default function hideWeekdayTidTimePlugin() {
  return {
    name: 'railog-hide-weekday-tid-time',
    enforce: 'pre',
    transform(source, id) {
      if (!id.replace(/\\/g, '/').endsWith('/src/pages/DepotStabling.jsx')) {
        return null;
      }

      let timePanelMatches = 0;
      const code = source.replace(
        /<div className="grid w-full grid-cols-\[34px_minmax\(0,1fr\)\] items-center gap-x-1 gap-y-0\.5">/g,
        () => {
          timePanelMatches += 1;
          return `<div
                        className="grid w-full grid-cols-[34px_minmax(0,1fr)] items-center gap-x-1 gap-y-0.5"
                        style={
                          (() => {
                            const normalizedRemark = String(insertedTidAssistRemark || "")
                              .toUpperCase()
                              .replace(/[^A-Z0-9]+/g, " ")
                              .trim();
                            const remarkTokens = normalizedRemark ? normalizedRemark.split(/\\s+/) : [];
                            const hasWeekdayRemark =
                              remarkTokens.includes("WD") ||
                              remarkTokens.includes("ED") ||
                              normalizedRemark.includes("EARLY REM") ||
                              normalizedRemark.includes("LATE REM");
                            const tidNumber = Number(insertedTid);

                            return isWeekdayActive &&
                              hasWeekdayRemark &&
                              (
                                (tidNumber >= 101 && tidNumber <= 120) ||
                                (tidNumber >= 201 && tidNumber <= 220)
                              );
                          })()
                            ? { display: "none" }
                            : undefined
                        }
                      >`;
        }
      );

      if (timePanelMatches === 0) {
        throw new Error('[hide-weekday-tid-time] Unable to locate insertion TID time panels in DepotStabling.jsx');
      }

      return { code, map: null };
    },
  };
}

// Weekday insertion cards keep their stored timing but hide the visible TIME row for active TIDs 101–120 and 201–220.
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
        (match) => {
          timePanelMatches += 1;
          return `<div
                        className="grid w-full grid-cols-[34px_minmax(0,1fr)] items-center gap-x-1 gap-y-0.5"
                        style={
                          isWeekdayActive && (
                            (Number(insertedTid) >= 101 && Number(insertedTid) <= 120) ||
                            (Number(insertedTid) >= 201 && Number(insertedTid) <= 220)
                          )
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

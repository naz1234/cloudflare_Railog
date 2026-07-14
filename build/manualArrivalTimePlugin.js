export default function manualArrivalTimePlugin() {
  let diagnostics = 'Manual Area source diagnostics were not collected.\n';

  return {
    name: 'railog-manual-arrival-time-diagnostics',
    enforce: 'pre',
    transform(source, id) {
      if (!id.replace(/\\/g, '/').endsWith('/src/pages/DepotStabling.jsx')) {
        return null;
      }

      const markers = [
        'const manualTrainSetReady',
        'const manualFromTp1Ready',
        'const fromTp1 =',
        'Time start moving from TP1',
        'key: "fromTp1"',
        'Fill From TP1 + to Manual',
      ];

      diagnostics = markers.map((marker) => {
        const index = source.indexOf(marker);
        if (index < 0) return `\n=== ${marker} ===\nNOT FOUND\n`;
        const start = Math.max(0, index - 350);
        const end = Math.min(source.length, index + 900);
        return `\n=== ${marker} ===\n${source.slice(start, end)}\n`;
      }).join('\n');

      return null;
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'manual-arrival-debug.txt',
        source: diagnostics,
      });
    },
  };
}

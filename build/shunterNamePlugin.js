export default function shunterNamePlugin() {
  return {
    name: 'railog-shunter-name-options',
    enforce: 'pre',
    transform(source, id) {
      if (!id.replace(/\\/g, '/').endsWith('/src/pages/DepotStabling.jsx')) {
        return null;
      }

      const optionListPattern = /  const SHUNTER_NAME_OPTIONS = \[\n([\s\S]*?)\n  \];/;
      const optionListMatch = source.match(optionListPattern);

      if (!optionListMatch) {
        throw new Error('[shunter-name] Unable to find Shunter Name option list in DepotStabling.jsx');
      }

      const existingNames = Array.from(
        optionListMatch[1].matchAll(/"([^"]+)"/g),
        (match) => String(match[1] || '').trim()
      ).filter(Boolean);

      const sortedNames = Array.from(new Set([...existingNames, 'AREFUR']))
        .sort((left, right) => left.localeCompare(right, 'en', { sensitivity: 'base' }));

      const sortedOptionList = [
        '  const SHUNTER_NAME_OPTIONS = [',
        ...sortedNames.map((name) => `    "${name}",`),
        '  ];',
      ].join('\n');

      return {
        code: source.replace(optionListPattern, sortedOptionList),
        map: null,
      };
    },
  };
}

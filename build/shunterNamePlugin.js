function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`[shunter-name] Unable to find ${label} in DepotStabling.jsx`);
  }
  return source.replace(before, after);
}

export default function shunterNamePlugin() {
  return {
    name: 'railog-shunter-name-options',
    enforce: 'pre',
    transform(source, id) {
      if (!id.replace(/\\/g, '/').endsWith('/src/pages/DepotStabling.jsx')) {
        return null;
      }

      const code = replaceRequired(
        source,
        `  const SHUNTER_NAME_OPTIONS = [
    "PAUL",
    "FAZREEN",
    "ARSHAD",`,
        `  const SHUNTER_NAME_OPTIONS = [
    "PAUL",
    "FAZREEN",
    "AREFUR",
    "ARSHAD",`,
        'Shunter Name option list'
      );

      return { code, map: null };
    },
  };
}

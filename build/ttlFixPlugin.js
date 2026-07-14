function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`[ttl-fix] Unable to find ${label} in DepotStabling.jsx`);
  }
  return source.replace(before, after);
}

export default function ttlFixPlugin() {
  return {
    name: 'railog-unfit-label-fix',
    enforce: 'pre',
    transform(source, id) {
      if (!id.replace(/\\/g, '/').endsWith('/src/pages/DepotStabling.jsx')) {
        return null;
      }

      let code = replaceOnce(
        source,
        `                  .map((value) => String(value || "").trim())
                  .filter((value) => value && /\\bUNFIT\\b/i.test(value))`,
        `                  .map((value) => String(value || "").trim())
                  .filter((value) => value && (
                    /\\bUNFIT\\b/i.test(value) ||
                    /\\bNOT[\\s/_-]*FIT\\b/i.test(value)
                  ))`,
        'UNFIT matcher'
      );

      code = replaceOnce(
        code,
        `          \`Total \${totalAutomaticAreaTrainCount} trains at automatic area.\`,`,
        `          \`Total \${totalAutomaticAreaTrainCount} trains at automatic area. (include one unfit train)\`,`,
        'automatic area tooltip text'
      );

      return { code, map: null };
    },
  };
}

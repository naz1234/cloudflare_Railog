function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`[pst-header] Unable to find ${label} in DepotStabling.jsx`);
  }
  return source.replace(before, after);
}

export default function pstHeaderPlugin() {
  return {
    name: 'railog-pst-depot-header-labels',
    enforce: 'pre',
    transform(source, id) {
      if (!id.replace(/\\/g, '/').endsWith('/src/pages/DepotStabling.jsx')) {
        return null;
      }

      let code = replaceRequired(
        source,
        'title="WEST DEPOT — PST / TRAIN PREP"',
        'title="WD — PST / TRAIN PREP"',
        'West Depot PST header'
      );

      code = replaceRequired(
        code,
        'title="EAST DEPOT — PST / TRAIN PREP"',
        'title="ED — PST / TRAIN PREP"',
        'East Depot PST header'
      );

      return { code, map: null };
    },
  };
}

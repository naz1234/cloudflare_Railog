function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`[ttl-fix] Unable to find ${label} in DepotStabling.jsx`);
  }
  return source.replace(before, after);
}

export default function ttlFixPlugin() {
  return {
    name: 'railog-ttl-calculation-fix',
    enforce: 'pre',
    transform(source, id) {
      if (!id.replace(/\\/g, '/').endsWith('/src/pages/DepotStabling.jsx')) {
        return null;
      }

      let code = source;

      code = replaceOnce(
        code,
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
        `  const totalServiceTrainCount = automaticAreaSummary.inServiceTrainIds.length;
  const totalAutomaticAreaTrainCount = automaticAreaSummary.automaticAreaTrainIds.length;
  const duplicateDepotTrainDetailText = duplicateDepotTrainDetails`,
        `  const totalServiceTrainCount = automaticAreaSummary.inServiceTrainIds.length;
  const totalAutomaticAreaTrainCount = automaticAreaSummary.automaticAreaTrainIds.length;
  const totalListedTrainCount = westDepotCopyCount + eastDepotCopyCount;
  const duplicateDepotTrainCount = duplicateDepotTrainIds.length;
  const unfitTrainCount = automaticAreaSummary.unfitTrainDetails.length;
  const duplicateDepotTrainDetailText = duplicateDepotTrainDetails`,
        'TTL calculation variables'
      );

      code = replaceOnce(
        code,
        `  const totalServiceText = [
    \`Total \${totalServiceTrainCount} trains in service.\`,
    ...(automaticAreaSummary.unfitTrainDetails.length
      ? [
          \`Total \${totalAutomaticAreaTrainCount} trains at automatic area.\`,
          \`Unfit Train : \${unfitTrainDetailText}\`,
        ]
      : []),`,
        `  const totalServiceText = [
    \`Total \${totalServiceTrainCount} trains in service.\`,
    \`Calculation : W \${westDepotCopyCount} + E \${eastDepotCopyCount} - Duplicate \${duplicateDepotTrainCount} - Unfit / Not Fit \${unfitTrainCount} = \${totalServiceTrainCount}.\`,
    \`Total \${totalListedTrainCount} trains listed before duplicate checking.\`,
    \`Total \${totalAutomaticAreaTrainCount} unique trains at automatic area.\`,
    ...(automaticAreaSummary.unfitTrainDetails.length
      ? [\`Unfit / Not Fit Train : \${unfitTrainDetailText}\`]
      : []),`,
        'TTL tooltip summary'
      );

      return { code, map: null };
    },
  };
}

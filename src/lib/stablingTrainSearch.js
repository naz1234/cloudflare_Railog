// Stabling search only: never concatenate separate train numbers or change stored IDs.
export function parseStablingTrainSearch(value = "") {
  const tokens = String(value ?? "").trim().toUpperCase()
    .replace(/\bT\s+(?=\d)/g, "T").split(/[\s,;/]+/).filter(Boolean);
  const trainKeys = new Set();
  const invalidTokens = new Set();
  for (const token of tokens) {
    const match = token.match(/^T?0*(\d{1,2})$/);
    const number = match ? Number(match[1]) : 0;
    if (number >= 1 && number <= 47) trainKeys.add(`T${number}`);
    else invalidTokens.add(token);
  }
  return { trainKeys: [...trainKeys], invalidTokens: [...invalidTokens] };
}

export function findStablingTrainLocations(trainKeys = [], depots = []) {
  const results = [];
  for (const trainKey of trainKeys) {
    for (const { depotLabel, roads, data, blockLabels, blockIndices } of depots) {
      for (const road of roads) {
        blockIndices.forEach((blockIndex, visualIndex) => {
          const storedId = String(data[road]?.[blockIndex]?.trainId ?? "").trim().toUpperCase().replace(/\s+/g, "");
          const match = storedId.match(/^T?0*(\d{1,2})$/);
          if (match && `T${Number(match[1])}` === trainKey) {
            results.push({ trainKey, depotLabel, road, blockLabel: blockLabels[visualIndex] });
          }
        });
      }
    }
  }
  return results;
}

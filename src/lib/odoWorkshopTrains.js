const DEFAULT_MAX_TRAIN_NUMBER = 47;

export function normalizeOdoWorkshopTrainToken(value, maxTrainNumber = DEFAULT_MAX_TRAIN_NUMBER) {
  const compact = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/^TRAIN/, "")
    .replace(/^TS?/, "");

  if (!/^\d{1,2}$/.test(compact)) return "";

  const trainNumber = Number(compact);
  if (!Number.isInteger(trainNumber) || trainNumber < 1 || trainNumber > maxTrainNumber) return "";

  return `TS${String(trainNumber).padStart(2, "0")}`;
}

export function parseOdoWorkshopTrainText(value, maxTrainNumber = DEFAULT_MAX_TRAIN_NUMBER) {
  const seen = new Set();

  return String(value ?? "")
    .split(/[\s,;]+/)
    .map((token) => normalizeOdoWorkshopTrainToken(token, maxTrainNumber))
    .filter((trainset) => {
      if (!trainset || seen.has(trainset)) return false;
      seen.add(trainset);
      return true;
    });
}

export function formatOdoWorkshopTrainText(workshops = {}) {
  return Object.entries(workshops)
    .filter(([, selected]) => !!selected)
    .map(([trainset]) => normalizeOdoWorkshopTrainToken(trainset))
    .filter(Boolean)
    .sort((left, right) => Number(left.slice(2)) - Number(right.slice(2)))
    .map((trainset) => trainset.slice(2))
    .join(" ");
}

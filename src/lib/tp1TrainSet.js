export function cleanTp1TrainSetInput(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 2);
}

export function isCompleteTp1TrainSetInput(value) {
  return /^\d{2}$/.test(String(value || ""));
}

export function normalizeInsertionTaName(value = "") {
  return String(value).replace(/\s+/g, " ").trim().slice(0, 40).trim();
}

export function withoutInsertionTaSuffix(text = "", taName = "") {
  const name = String(taName).trim();
  const suffix = name ? ` TA ${name} onboard.` : "";
  return suffix && text.endsWith(suffix) ? text.slice(0, -suffix.length) : text;
}

const PST_NON_GREEN_REMARK_ACCENTS = [
  "#fbbf24", // amber
  "#38bdf8", // sky
  "#a78bfa", // violet
  "#f472b6", // pink
  "#fb7185", // rose
  "#fb923c", // orange
  "#818cf8", // indigo
  "#ef4444", // red
  "#d946ef", // magenta
  "#eab308", // gold
];

function hashRemarkLabel(value = "") {
  const key = String(value || "").trim().toUpperCase();
  let hash = 2166136261;

  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  return hash >>> 0;
}

export function isGreenPSTRemarkAccent(value = "") {
  const match = /^#([0-9a-f]{6})$/i.exec(String(value || "").trim());
  if (!match) return false;

  const hex = match[1];
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);

  return green >= 100 && green > red * 1.08 && green > blue * 1.08;
}

export function getPSTRemarkAccent(accent = "", label = "") {
  if (!isGreenPSTRemarkAccent(accent)) return accent;

  return PST_NON_GREEN_REMARK_ACCENTS[
    hashRemarkLabel(label) % PST_NON_GREEN_REMARK_ACCENTS.length
  ];
}

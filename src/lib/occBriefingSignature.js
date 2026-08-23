import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

export const OCC_SIGNATURE_FONT = "Cochocib Script Latin Pro";
export const OCC_FORM_SHEET = "Form";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PACKAGE_RELATIONSHIPS = "http://schemas.openxmlformats.org/package/2006/relationships";
const OFFICE_RELATIONSHIPS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const DRAWING_NAMESPACE = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
const MAIN_DRAWING_NAMESPACE = "http://schemas.openxmlformats.org/drawingml/2006/main";
const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const XML_NAME = "(?:[A-Za-z_][\\w.-]*:)?";

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function xmlUnescape(value) {
  return String(value ?? "").replace(/&#x([\da-f]+);|&#(\d+);|&(amp|lt|gt|quot|apos);/gi, (match, hex, decimal, named) => {
    if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
    if (decimal) return String.fromCodePoint(Number.parseInt(decimal, 10));
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[named] || match;
  });
}

function attribute(xml, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(xml || "").match(new RegExp(`(?:^|\\s)${escapedName}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"));
  return match ? xmlUnescape(match[2]) : "";
}

function archiveText(archive, path, label = path) {
  if (!archive[path]) throw new Error(`${label} is missing from this Excel workbook.`);
  return strFromU8(archive[path]);
}

function normalizeArchivePath(base, target) {
  const parts = `${base}/${String(target || "").replace(/\\/g, "/")}`.split("/");
  const result = [];
  parts.forEach((part) => {
    if (!part || part === ".") return;
    if (part === "..") result.pop();
    else result.push(part);
  });
  return result.join("/");
}

function directoryName(path) {
  return path.slice(0, path.lastIndexOf("/"));
}

function relationshipsPath(path) {
  const directory = directoryName(path);
  return `${directory}/_rels/${path.slice(directory.length + 1)}.rels`;
}

function relationshipNodes(xml) {
  return String(xml || "").match(new RegExp(`<${XML_NAME}Relationship\\b[^>]*\\/?>`, "gi")) || [];
}

function locateSheet(archive, requestedName, required = true) {
  const workbookXml = archiveText(archive, "xl/workbook.xml", "Workbook definition");
  const workbookRels = archiveText(archive, "xl/_rels/workbook.xml.rels", "Workbook relationships");
  const sheets = workbookXml.match(new RegExp(`<${XML_NAME}sheet\\b[^>]*\\/?>`, "gi")) || [];
  const sheet = sheets.find((node) => attribute(node, "name").trim().toLowerCase() === requestedName.toLowerCase());
  if (!sheet) {
    if (!required) return null;
    throw new Error(`The "${requestedName}" worksheet was not found. Upload an OCC Book In and Briefing Form.`);
  }

  const relationshipId = attribute(sheet, "r:id");
  const relationship = relationshipNodes(workbookRels).find((node) => attribute(node, "Id") === relationshipId);
  if (!relationship) throw new Error(`The "${requestedName}" worksheet link could not be read.`);

  const path = normalizeArchivePath("xl", attribute(relationship, "Target"));
  return { path, xml: archiveText(archive, path, `${requestedName} worksheet`) };
}

function sharedStrings(archive) {
  if (!archive["xl/sharedStrings.xml"]) return [];
  const stringsXml = strFromU8(archive["xl/sharedStrings.xml"]);
  const items = stringsXml.match(new RegExp(`<${XML_NAME}si(?:\\s[^>]*)?>[\\s\\S]*?<\\/${XML_NAME}si\\s*>`, "gi")) || [];
  return items.map((item) => {
    const values = [...item.matchAll(new RegExp(`<${XML_NAME}t(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${XML_NAME}t\\s*>`, "gi"))];
    return values.map((match) => xmlUnescape(match[1])).join("");
  });
}

function cellMap(sheetXml) {
  const pattern = new RegExp(`<${XML_NAME}c\\b[^>]*?(?:\\/\\s*>|>[\\s\\S]*?<\\/${XML_NAME}c\\s*>)`, "gi");
  const result = new Map();
  for (const match of sheetXml.matchAll(pattern)) {
    const reference = attribute(match[0], "r").toUpperCase();
    if (reference) result.set(reference, match[0]);
  }
  return result;
}

function readCell(cells, reference, strings) {
  const cell = cells.get(reference.toUpperCase());
  if (!cell) return "";

  if (attribute(cell, "t") === "inlineStr") {
    return [...cell.matchAll(new RegExp(`<${XML_NAME}t(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${XML_NAME}t\\s*>`, "gi"))]
      .map((match) => xmlUnescape(match[1])).join("");
  }

  const raw = cell.match(new RegExp(`<${XML_NAME}v(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${XML_NAME}v\\s*>`, "i"))?.[1] || "";
  return attribute(cell, "t") === "s" ? strings[Number(raw)] || "" : xmlUnescape(raw);
}

function replaceCell(sheetXml, cells, reference, value, { numeric = false, styleIndex = null } = {}) {
  const current = cells.get(reference.toUpperCase());
  if (!current) throw new Error(`Required OCC form cell ${reference} was not found.`);

  let opening = current.match(new RegExp(`^<${XML_NAME}c\\b[^>]*`, "i"))?.[0] || "";
  opening = opening.replace(/\s(?:t|vm|cm|ph)\s*=\s*(["'])[\s\S]*?\1/gi, "");
  opening = opening.replace(/\s*\/$/, "");
  if (styleIndex !== null) {
    opening = /\ss\s*=/.test(opening)
      ? opening.replace(/(\ss\s*=\s*)(["'])[\s\S]*?\2/i, `$1"${styleIndex}"`)
      : `${opening} s="${styleIndex}"`;
  }
  if (!numeric) opening += ' t="inlineStr"';
  const prefix = opening.match(/^<([A-Za-z_][\w.-]*:)?c\b/i)?.[1] || "";
  const body = numeric
    ? `<${prefix}v>${value}</${prefix}v>`
    : `<${prefix}is><${prefix}t xml:space="preserve">${xmlEscape(value)}</${prefix}t></${prefix}is>`;
  const updated = `${opening}>${body}</${prefix}c>`;
  cells.set(reference.toUpperCase(), updated);
  return sheetXml.replace(current, updated);
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function excelTimeToInput(value) {
  if (value === "" || value === null || value === undefined) return "";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value).slice(0, 5);
  const minutes = Math.round((((numeric % 1) + 1) % 1) * 24 * 60) % (24 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function parseOccTime(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    throw new Error("Time must use the 24-hour HH:MM format.");
  }
  return (Number(match[1]) * 60 + Number(match[2])) / (24 * 60);
}

function excelDateLabel(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) return String(value || "").trim();
  return new Date(Date.UTC(1899, 11, 30) + Math.floor(numeric) * 86400000)
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function formRows(cells, strings) {
  let headerRow = 0;
  for (const reference of cells.keys()) {
    if (!/^C\d+$/.test(reference)) continue;
    const row = Number(reference.slice(1));
    if (/^id\s*no\.?$/i.test(readCell(cells, `C${row}`, strings).trim())
      && /^name$/i.test(readCell(cells, `D${row}`, strings).trim())
      && /^signatures?$/i.test(readCell(cells, `J${row}`, strings).trim())) {
      headerRow = row;
      break;
    }
  }
  if (!headerRow) throw new Error("The OCC sign-in table could not be found in the Form worksheet.");

  const rows = [];
  for (let rowNumber = headerRow + 1; rowNumber <= headerRow + 100; rowNumber += 1) {
    const sequence = readCell(cells, `B${rowNumber}`, strings);
    if (!sequence || !/^\d+$/.test(sequence.trim())) break;
    const entry = {
      rowNumber,
      employeeId: readCell(cells, `C${rowNumber}`, strings).trim(),
      employeeName: readCell(cells, `D${rowNumber}`, strings).trim(),
      position: readCell(cells, `G${rowNumber}`, strings).trim(),
      timeIn: excelTimeToInput(readCell(cells, `H${rowNumber}`, strings)),
      timeOut: excelTimeToInput(readCell(cells, `I${rowNumber}`, strings)),
      signature: readCell(cells, `J${rowNumber}`, strings).trim(),
    };
    entry.empty = ![entry.employeeId, entry.employeeName, entry.position, entry.timeIn, entry.timeOut, entry.signature].some(Boolean);
    rows.push(entry);
  }
  if (!rows.length) throw new Error("The OCC sign-in table does not contain any available staff rows.");
  return rows;
}

function staffDirectory(archive, strings) {
  const dataSheet = locateSheet(archive, "Data", false);
  if (!dataSheet) return [];
  const cells = cellMap(dataSheet.xml);
  const people = [];
  for (let row = 2; row <= 1000; row += 1) {
    const employeeId = readCell(cells, `A${row}`, strings).trim();
    const name = readCell(cells, `B${row}`, strings).trim();
    const position = readCell(cells, `C${row}`, strings).trim();
    if (!employeeId && !name) {
      if (row > 20) break;
      continue;
    }
    if (employeeId && name) people.push({ employeeId, name, position });
  }
  return people;
}

function preferredTimeOut(rows, shift) {
  const counts = new Map();
  rows.forEach(({ timeOut }) => {
    if (timeOut) counts.set(timeOut, (counts.get(timeOut) || 0) + 1);
  });
  if (counts.size) return [...counts].sort((left, right) => right[1] - left[1])[0][0];
  if (/night/i.test(shift)) return "07:30";
  if (/late/i.test(shift)) return "23:30";
  if (/early/i.test(shift)) return "15:30";
  return "";
}

function workbookDetails(archive) {
  const strings = sharedStrings(archive);
  const form = locateSheet(archive, OCC_FORM_SHEET);
  const cells = cellMap(form.xml);
  const rows = formRows(cells, strings);
  const shift = readCell(cells, "L10", strings).trim();
  return {
    archive,
    form,
    cells,
    strings,
    rows,
    shift,
    date: excelDateLabel(readCell(cells, "L9", strings)),
    nextRow: rows.find((row) => row.empty)?.rowNumber || null,
    existingCount: rows.filter((row) => !row.empty).length,
    suggestedTimeOut: preferredTimeOut(rows, shift),
    staff: staffDirectory(archive, strings),
  };
}

export async function inspectOccBriefingWorkbook(sourceFile) {
  if (!sourceFile) throw new Error("Upload an OCC Book In and Briefing Form first.");
  const archive = unzipSync(new Uint8Array(await sourceFile.arrayBuffer()));
  const { archive: ignoredArchive, form, cells, strings, rows, ...details } = workbookDetails(archive);
  void ignoredArchive;
  void form;
  void cells;
  void strings;
  void rows;
  return details;
}

function fontScore(fontXml) {
  const nameTag = fontXml.match(new RegExp(`<${XML_NAME}name\\b[^>]*\\/?>`, "i"))?.[0] || "";
  if (attribute(nameTag, "val") !== OCC_SIGNATURE_FONT) return -1;
  if (!new RegExp(`<${XML_NAME}b(?:\\s[^>]*)?\\/?>`, "i").test(fontXml)) return -1;
  if (new RegExp(`<${XML_NAME}strike(?:\\s[^>]*)?\\/?>`, "i").test(fontXml)) return -1;
  const sizeTag = fontXml.match(new RegExp(`<${XML_NAME}sz\\b[^>]*\\/?>`, "i"))?.[0] || "";
  return 100 - Math.abs(Number(attribute(sizeTag, "val") || 18) - 18);
}

function incrementCount(openingTag, count) {
  return /\scount\s*=/.test(openingTag)
    ? openingTag.replace(/(\scount\s*=\s*)(["'])[\s\S]*?\2/i, `$1"${count}"`)
    : openingTag.replace(/>$/, ` count="${count}">`);
}

function updateSignatureStyle(archive, baseStyleIndex) {
  let xml = archiveText(archive, "xl/styles.xml", "Excel styles");
  const fontBlock = xml.match(new RegExp(`(<${XML_NAME}fonts\\b[^>]*>)([\\s\\S]*?)(<\\/${XML_NAME}fonts\\s*>)`, "i"));
  if (!fontBlock) throw new Error("The signature font styles could not be read.");
  const fonts = fontBlock[2].match(new RegExp(`<${XML_NAME}font(?:\\s[^>]*)?>[\\s\\S]*?<\\/${XML_NAME}font\\s*>`, "gi")) || [];
  let fontIndex = -1;
  let score = -1;
  fonts.forEach((font, index) => {
    const candidate = fontScore(font);
    if (candidate > score) {
      score = candidate;
      fontIndex = index;
    }
  });

  if (fontIndex < 0) {
    fontIndex = fonts.length;
    const font = `<font><b/><sz val="18"/><color rgb="FF000000"/><name val="${xmlEscape(OCC_SIGNATURE_FONT)}"/></font>`;
    xml = xml.replace(fontBlock[0], `${incrementCount(fontBlock[1], fonts.length + 1)}${fontBlock[2]}${font}${fontBlock[3]}`);
  }

  const stylesBlock = xml.match(new RegExp(`(<${XML_NAME}cellXfs\\b[^>]*>)([\\s\\S]*?)(<\\/${XML_NAME}cellXfs\\s*>)`, "i"));
  if (!stylesBlock) throw new Error("The signature cell styles could not be read.");
  const styles = stylesBlock[2].match(new RegExp(`<${XML_NAME}xf\\b[^>]*?(?:\\/\\s*>|>[\\s\\S]*?<\\/${XML_NAME}xf\\s*>)`, "gi")) || [];
  const baseStyle = styles[baseStyleIndex];
  if (!baseStyle) throw new Error("The existing signature cell formatting could not be read.");
  if (Number(attribute(baseStyle, "fontId")) === fontIndex && attribute(baseStyle, "applyFont") === "1") {
    archive["xl/styles.xml"] = strToU8(xml);
    return baseStyleIndex;
  }

  let signatureStyle = /\sfontId\s*=/.test(baseStyle)
    ? baseStyle.replace(/(\sfontId\s*=\s*)(["'])[\s\S]*?\2/i, `$1"${fontIndex}"`)
    : baseStyle.replace(/^<((?:[A-Za-z_][\w.-]*:)?xf)\b/i, `<$1 fontId="${fontIndex}"`);
  signatureStyle = /\sapplyFont\s*=/.test(signatureStyle)
    ? signatureStyle.replace(/(\sapplyFont\s*=\s*)(["'])[\s\S]*?\2/i, '$1"1"')
    : signatureStyle.replace(/^<((?:[A-Za-z_][\w.-]*:)?xf)\b/i, '<$1 applyFont="1"');

  const styleIndex = styles.length;
  xml = xml.replace(stylesBlock[0], `${incrementCount(stylesBlock[1], styleIndex + 1)}${stylesBlock[2]}${signatureStyle}${stylesBlock[3]}`);
  archive["xl/styles.xml"] = strToU8(xml);
  return styleIndex;
}

function nextRelationshipId(xml) {
  const usedIds = relationshipNodes(xml).map((node) => Number(attribute(node, "Id").match(/^rId(\d+)$/)?.[1] || 0));
  return `rId${Math.max(0, ...usedIds) + 1}`;
}

function appendRelationship(xml, relationship) {
  return xml.replace(new RegExp(`<\\/${XML_NAME}Relationships\\s*>`, "i"), `${relationship}</Relationships>`);
}

function emptyRelationships() {
  return `${XML_HEADER}<Relationships xmlns="${PACKAGE_RELATIONSHIPS}"></Relationships>`;
}

function registerContentType(archive, extension, contentType) {
  const path = "[Content_Types].xml";
  let xml = archiveText(archive, path, "Excel content types");
  const defaults = xml.match(new RegExp(`<${XML_NAME}Default\\b[^>]*\\/?>`, "gi")) || [];
  if (defaults.some((node) => attribute(node, "Extension").toLowerCase() === extension)) return;
  xml = xml.replace(new RegExp(`<\\/${XML_NAME}Types\\s*>`, "i"), `<Default Extension="${extension}" ContentType="${contentType}"/></Types>`);
  archive[path] = strToU8(xml);
}

function registerDrawingContentType(archive, drawingPath) {
  const path = "[Content_Types].xml";
  let xml = archiveText(archive, path, "Excel content types");
  const partName = `/${drawingPath}`;
  const overrides = xml.match(new RegExp(`<${XML_NAME}Override\\b[^>]*\\/?>`, "gi")) || [];
  if (overrides.some((node) => attribute(node, "PartName") === partName)) return;
  xml = xml.replace(new RegExp(`<\\/${XML_NAME}Types\\s*>`, "i"), `<Override PartName="${partName}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`);
  archive[path] = strToU8(xml);
}

function nextArchiveNumber(archive, expression) {
  return Math.max(0, ...Object.keys(archive).map((path) => Number(path.match(expression)?.[1] || 0))) + 1;
}

function ensureWorksheetDrawing(archive, sheetPath, sheetXml) {
  const sheetRelsPath = relationshipsPath(sheetPath);
  let sheetRels = archive[sheetRelsPath] ? strFromU8(archive[sheetRelsPath]) : emptyRelationships();
  const drawingRelationship = relationshipNodes(sheetRels).find((node) => attribute(node, "Type") === `${OFFICE_RELATIONSHIPS}/drawing`);
  if (drawingRelationship) {
    return {
      sheetXml,
      drawingPath: normalizeArchivePath(directoryName(sheetPath), attribute(drawingRelationship, "Target")),
    };
  }

  const drawingNumber = nextArchiveNumber(archive, /^xl\/drawings\/drawing(\d+)\.xml$/);
  const drawingPath = `xl/drawings/drawing${drawingNumber}.xml`;
  const relationshipId = nextRelationshipId(sheetRels);
  const relationship = `<Relationship Id="${relationshipId}" Type="${OFFICE_RELATIONSHIPS}/drawing" Target="../drawings/drawing${drawingNumber}.xml"/>`;
  sheetRels = appendRelationship(sheetRels, relationship);
  archive[sheetRelsPath] = strToU8(sheetRels);
  archive[drawingPath] = strToU8(`${XML_HEADER}<xdr:wsDr xmlns:xdr="${DRAWING_NAMESPACE}" xmlns:a="${MAIN_DRAWING_NAMESPACE}"></xdr:wsDr>`);
  registerDrawingContentType(archive, drawingPath);

  const drawingTag = `<drawing r:id="${relationshipId}"/>`;
  const lateNode = sheetXml.match(new RegExp(`<(?:${XML_NAME}legacyDrawing|${XML_NAME}legacyDrawingHF|${XML_NAME}picture|${XML_NAME}oleObjects|${XML_NAME}controls|${XML_NAME}webPublishItems|${XML_NAME}tableParts|${XML_NAME}extLst)\\b`, "i"));
  if (lateNode) sheetXml = `${sheetXml.slice(0, lateNode.index)}${drawingTag}${sheetXml.slice(lateNode.index)}`;
  else sheetXml = sheetXml.replace(new RegExp(`<\\/${XML_NAME}worksheet\\s*>`, "i"), `${drawingTag}</worksheet>`);

  return { sheetXml, drawingPath };
}

function signatureAnchor({ rowNumber, relationshipId, shapeId }) {
  const zeroBasedRow = rowNumber - 1;
  return `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>9</xdr:col><xdr:colOff>38100</xdr:colOff><xdr:row>${zeroBasedRow}</xdr:row><xdr:rowOff>19050</xdr:rowOff></xdr:from><xdr:to><xdr:col>12</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${rowNumber}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${shapeId}" name="OCC signature row ${rowNumber}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="${OFFICE_RELATIONSHIPS}" r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1600200" cy="285750"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor>`;
}

function imageDetails(file) {
  const name = String(file?.name || "").toLowerCase();
  const type = String(file?.type || "").toLowerCase();
  if (type === "image/png" || /\.png$/.test(name)) return { extension: "png", contentType: "image/png" };
  if (["image/jpeg", "image/jpg"].includes(type) || /\.jpe?g$/.test(name)) return { extension: "jpeg", contentType: "image/jpeg" };
  throw new Error("Signature images must be PNG or JPG files.");
}

async function insertSignatureImage(archive, form, rowNumber, imageFile) {
  const image = imageDetails(imageFile);
  const imageNumber = nextArchiveNumber(archive, /^xl\/media\/image(\d+)\.[^.]+$/);
  const imagePath = `xl/media/image${imageNumber}.${image.extension}`;
  archive[imagePath] = new Uint8Array(await imageFile.arrayBuffer());
  registerContentType(archive, image.extension, image.contentType);

  const drawing = ensureWorksheetDrawing(archive, form.path, form.xml);
  form.xml = drawing.sheetXml;
  const drawingXml = archiveText(archive, drawing.drawingPath, "Worksheet drawing");
  const drawingRelsPath = relationshipsPath(drawing.drawingPath);
  let drawingRels = archive[drawingRelsPath] ? strFromU8(archive[drawingRelsPath]) : emptyRelationships();
  const relationshipId = nextRelationshipId(drawingRels);
  drawingRels = appendRelationship(drawingRels, `<Relationship Id="${relationshipId}" Type="${OFFICE_RELATIONSHIPS}/image" Target="../media/image${imageNumber}.${image.extension}"/>`);
  archive[drawingRelsPath] = strToU8(drawingRels);

  const shapeIds = [...drawingXml.matchAll(/<(?:(?:[A-Za-z_][\w.-]*):)?cNvPr\b[^>]*\bid\s*=\s*(["'])(\d+)\1/gi)]
    .map((match) => Number(match[2]));
  const shapeId = Math.max(0, ...shapeIds) + 1;
  const updatedDrawing = drawingXml.replace(new RegExp(`<\\/${XML_NAME}wsDr\\s*>`, "i"), `${signatureAnchor({ rowNumber, relationshipId, shapeId })}</xdr:wsDr>`);
  archive[drawing.drawingPath] = strToU8(updatedDrawing);
}

function outputFileName(originalName) {
  return String(originalName || "OCC Book In and Briefing Form.xlsx");
}

export async function signOccBriefingWorkbook({
  sourceFile,
  employeeId,
  employeeName,
  position,
  timeIn,
  timeOut,
  signatureFile = null,
  signatureText = "",
}) {
  const cleanId = String(employeeId || "").trim();
  const cleanName = String(employeeName || "").trim();
  const cleanPosition = String(position || "").trim();
  if (!sourceFile) throw new Error("Upload an OCC Book In and Briefing Form first.");
  if (!cleanId) throw new Error("Enter the employee ID.");
  if (!cleanName) throw new Error("Enter the employee name.");
  if (!cleanPosition) throw new Error("Enter the employee position.");
  if (!timeIn) throw new Error("Enter the time in.");

  const archive = unzipSync(new Uint8Array(await sourceFile.arrayBuffer()));
  const details = workbookDetails(archive);
  const duplicate = details.rows.find((row) => row.employeeId === cleanId || (row.employeeName && normalizeName(row.employeeName) === normalizeName(cleanName)));
  if (duplicate) {
    throw new Error(`${cleanName} is already recorded on row ${duplicate.rowNumber}; existing staff entries will not be changed.`);
  }
  const target = details.rows.find((row) => row.empty);
  if (!target) throw new Error("All OCC sign-in rows are already occupied; no existing staff entry was changed.");

  const row = target.rowNumber;
  details.form.xml = replaceCell(details.form.xml, details.cells, `C${row}`, /^\d+$/.test(cleanId) ? Number(cleanId) : cleanId, { numeric: /^\d+$/.test(cleanId) });
  details.form.xml = replaceCell(details.form.xml, details.cells, `D${row}`, cleanName);
  details.form.xml = replaceCell(details.form.xml, details.cells, `G${row}`, cleanPosition);
  details.form.xml = replaceCell(details.form.xml, details.cells, `H${row}`, parseOccTime(timeIn), { numeric: true });
  if (timeOut) details.form.xml = replaceCell(details.form.xml, details.cells, `I${row}`, parseOccTime(timeOut), { numeric: true });

  if (signatureFile) {
    await insertSignatureImage(archive, details.form, row, signatureFile);
  } else {
    const signatureCell = details.cells.get(`J${row}`);
    const baseStyleIndex = Number(attribute(signatureCell, "s") || 0);
    const styleIndex = updateSignatureStyle(archive, baseStyleIndex);
    details.form.xml = replaceCell(details.form.xml, details.cells, `J${row}`, String(signatureText || cleanName).trim(), { styleIndex });
  }

  archive[details.form.path] = strToU8(details.form.xml);
  const bytes = zipSync(archive, { level: 6 });
  return {
    blob: new Blob([Uint8Array.from(bytes)], { type: XLSX_MIME }),
    fileName: outputFileName(sourceFile.name),
    rowNumber: row,
    preservedEntries: details.existingCount,
    shift: details.shift,
    signatureType: signatureFile ? "image" : "text",
  };
}

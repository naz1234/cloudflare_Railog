import { strToU8, zipSync } from 'fflate';
import { formatWashDate, formatWashTime, groupWashRows } from './wsh2Records.js';

const widths = [390, 1780, 2340, 1010, 850, 800, 3296];
const xml = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
function paragraph(text, { bold = false, size = 19, align = 'center', after = 0 } = {}) {
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="${after}" w:line="220" w:lineRule="auto"/><w:jc w:val="${align}"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:color w:val="000000"/><w:sz w:val="${size}"/>${bold ? '<w:b/>' : ''}</w:rPr>${String(text).split('\n').map((line, i) => `${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${xml(line || ' ')}</w:t>`).join('')}</w:r></w:p>`;
}
function cell(text, width, { span = 1, fill = '', ...options } = {}) {
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:vAlign w:val="center"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}${fill ? `<w:shd w:val="clear" w:fill="${fill}"/>` : ''}</w:tcPr>${paragraph(text, options)}</w:tc>`;
}
function table(group) {
  const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((edge) => `<w:${edge} w:val="single" w:sz="6" w:color="000000"/>`).join('');
  const heading = `<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>${cell(`${formatWashDate(group.date)}${group.continued ? ' (cont.)' : ''}`, widths[0] + widths[1], { span: 2, fill: 'F4C542', bold: true, size: 19 })}${cell('', widths.slice(2).reduce((a, b) => a + b), { span: 5 })}</w:tr>`;
  const headers = ['', 'Train Number', 'Next Wash', 'Location', 'DONE', 'HVAC', 'PARTIAL / FULL\nWD or ED'];
  const columnRow = `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${headers.map((value, i) => cell(value, widths[i], { bold: true, size: 19 })).join('')}</w:tr>`;
  const body = Array.from({ length: Math.max(18, Math.min(19, group.rows.length + 1)) }, (_, i) => {
    const row = group.rows[i];
    const depot = row?.depot === 'west' ? 'WD' : row?.depot === 'east' ? 'ED' : '';
    const values = row ? [group.offset + i + 1, row.trainNumber, formatWashTime(row.nextWash), row.location, row.completed ? 'DONE' : '', row.hvac === 'ON' ? 'ON' : '', [row.washType, depot].filter(Boolean).join(' / ')] : [group.offset + i + 1, '', '', '', '', '', ''];
    return `<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="270" w:hRule="atLeast"/></w:trPr>${values.map((value, index) => cell(value, widths[index])).join('')}</w:tr>`;
  }).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="10466" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${borders}</w:tblBorders><w:tblCellMar><w:top w:w="25" w:type="dxa"/><w:bottom w:w="25" w:type="dxa"/><w:left w:w="55" w:type="dxa"/><w:right w:w="55" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map((width) => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>${heading}${columnRow}${body}</w:tbl>`;
}

export function buildWsh2Docx(rows, { depotLabel = 'West and East Depot', dcMark = '' } = {}) {
  if (!rows.length) throw new Error('Upload at least one wash entry to print.');
  const sections = groupWashRows(rows).flatMap((group) => {
    const result = [];
    for (let i = 0; i < group.rows.length; i += 19) result.push({ date: group.date, rows: group.rows.slice(i, i + 19), offset: i, continued: i > 0 });
    return result;
  });
  let body = '';
  for (let i = 0; i < sections.length; i += 2) {
    if (i) body += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    body += paragraph(`AWP WASH CHECKLIST   ${depotLabel.toUpperCase()}`, { bold: true, size: 22, after: 160 });
    body += table(sections[i]);
    if (sections[i + 1]) body += paragraph('', { size: 4, after: 70 }) + table(sections[i + 1]);
    body += paragraph(`DC MARK${dcMark.trim() ? `: ${dcMark.trim()}` : ': __________________'}`, { bold: true, align: 'right', after: 0 });
  }
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="0" w:footer="0"/></w:sectPr></w:body></w:document>`;
  return zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/document.xml': strToU8(document),
  }, { level: 6 });
}

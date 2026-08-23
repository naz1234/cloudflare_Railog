import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  inspectOccBriefingWorkbook,
  OCC_SIGNATURE_FONT,
  parseOccTime,
  signOccBriefingWorkbook,
} from "../src/lib/occBriefingSignature.js";

const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const OFFICE_RELS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_RELS = "http://schemas.openxmlformats.org/package/2006/relationships";
const DRAWING = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
const DRAWING_MAIN = "http://schemas.openxmlformats.org/drawingml/2006/main";
const PNG_BYTES = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

function cell(reference, value = null, { numeric = false, style = 0 } = {}) {
  if (value === null) return `<c r="${reference}" s="${style}"/>`;
  if (numeric) return `<c r="${reference}" s="${style}"><v>${value}</v></c>`;
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t>${value}</t></is></c>`;
}

function staffRow(rowNumber, { employeeId = null, name = null, position = null, timeIn = null, timeOut = null, signature = null } = {}) {
  return `<row r="${rowNumber}">${[
    cell(`B${rowNumber}`, rowNumber - 63, { numeric: true }),
    cell(`C${rowNumber}`, employeeId, { numeric: employeeId !== null }),
    cell(`D${rowNumber}`, name),
    cell(`G${rowNumber}`, position),
    cell(`H${rowNumber}`, timeIn, { numeric: timeIn !== null }),
    cell(`I${rowNumber}`, timeOut, { numeric: timeOut !== null }),
    cell(`J${rowNumber}`, signature, { style: 1 }),
  ].join("")}</row>`;
}

function sampleWorkbook({ occupiedRows = 1, drawingOnForm = true, scriptFont = true } = {}) {
  const rows = Array.from({ length: 3 }, (_, index) => {
    const rowNumber = 64 + index;
    if (index >= occupiedRows) return staffRow(rowNumber);
    return staffRow(rowNumber, {
      employeeId: 1000200 + index,
      name: `Existing Staff ${index + 1}`,
      position: "DC",
      timeIn: parseOccTime("22:55"),
      timeOut: parseOccTime("07:30"),
      signature: index === 0 ? "Already signed" : `Signature ${index + 1}`,
    });
  }).join("");

  const form = `<worksheet xmlns="${MAIN}" xmlns:r="${OFFICE_RELS}"><sheetData><row r="9">${cell("L9", 46256, { numeric: true })}</row><row r="10">${cell("L10", "Night Shift")}</row><row r="63">${cell("B63", "No.")}${cell("C63", "ID No.")}${cell("D63", "Name")}${cell("G63", "Position")}${cell("J63", "Signatures")}</row>${rows}</sheetData>${drawingOnForm ? '<drawing r:id="rId2"/>' : ""}</worksheet>`;
  const directory = `<worksheet xmlns="${MAIN}"><sheetData><row r="1">${cell("A1", "ID")}${cell("B1", "Name")}${cell("C1", "Position")}</row><row r="2">${cell("A2", 1000335, { numeric: true })}${cell("B2", "Muhammad Bin Nazif Jaafar")}${cell("C2", "DC")}</row><row r="3">${cell("A3", 1000628, { numeric: true })}${cell("B3", "Khairil Rosli")}${cell("C3", "DC")}</row></sheetData></worksheet>`;
  const fonts = `<font><sz val="11"/><name val="Aptos"/></font>${scriptFont ? `<font><b/><sz val="18"/><name val="${OCC_SIGNATURE_FONT}"/></font>` : ""}`;
  const archive = {
    "[Content_Types].xml": strToU8(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`),
    "xl/workbook.xml": strToU8(`<workbook xmlns="${MAIN}" xmlns:r="${OFFICE_RELS}"><sheets><sheet name="Form" sheetId="1" r:id="rId1"/><sheet name="Data" sheetId="2" r:id="rId2"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<Relationships xmlns="${PACKAGE_RELS}"><Relationship Id="rId1" Type="${OFFICE_RELS}/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId2" Type="${OFFICE_RELS}/worksheet" Target="worksheets/sheet3.xml"/></Relationships>`),
    "xl/worksheets/sheet2.xml": strToU8(form),
    "xl/worksheets/sheet3.xml": strToU8(directory),
    "xl/worksheets/_rels/sheet2.xml.rels": strToU8(`<Relationships xmlns="${PACKAGE_RELS}"><Relationship Id="rId1" Type="${OFFICE_RELS}/printerSettings" Target="../printerSettings/settings.bin"/>${drawingOnForm ? `<Relationship Id="rId2" Type="${OFFICE_RELS}/drawing" Target="../drawings/drawing1.xml"/>` : ""}</Relationships>`),
    "xl/drawings/drawing1.xml": strToU8(`<xdr:wsDr xmlns:xdr="${DRAWING}" xmlns:a="${DRAWING_MAIN}"><xdr:twoCellAnchor><xdr:from><xdr:row>63</xdr:row></xdr:from><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="7" name="Existing handwritten signature"/></xdr:nvPicPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`),
    "xl/drawings/_rels/drawing1.xml.rels": strToU8(`<Relationships xmlns="${PACKAGE_RELS}"><Relationship Id="rId1" Type="${OFFICE_RELS}/customXml" Target="../ink/ink1.xml"/></Relationships>`),
    "xl/ink/ink1.xml": strToU8("<ink>preserve existing handwritten signature</ink>"),
    "xl/media/image1.png": Uint8Array.from([1, 2, 3]),
    "xl/styles.xml": strToU8(`<styleSheet xmlns="${MAIN}"><fonts count="${scriptFont ? 2 : 1}">${fonts}</fonts><cellXfs count="2"><xf numFmtId="0" fontId="0" borderId="1"/><xf numFmtId="0" fontId="0" borderId="7" applyAlignment="1"><alignment horizontal="center"/></xf></cellXfs></styleSheet>`),
  };
  const bytes = zipSync(archive);
  return { name: "OCC Book In and Briefing Form_Early Shift.xlsx", arrayBuffer: async () => bytes };
}

function signatureImage() {
  return { name: "signature.png", type: "image/png", arrayBuffer: async () => PNG_BYTES };
}

function signOptions(sourceFile, overrides = {}) {
  return {
    sourceFile,
    employeeId: "1000335",
    employeeName: "Muhammad Bin Nazif Jaafar",
    position: "DC",
    timeIn: "23:01",
    timeOut: "07:30",
    ...overrides,
  };
}

test("OCC form inspection reads the actual shift, available row, staff directory, and shift end", async () => {
  const details = await inspectOccBriefingWorkbook(sampleWorkbook());
  assert.equal(details.shift, "Night Shift");
  assert.equal(details.nextRow, 65);
  assert.equal(details.existingCount, 1);
  assert.equal(details.suggestedTimeOut, "07:30");
  assert.deepEqual(details.staff[0], { employeeId: "1000335", name: "Muhammad Bin Nazif Jaafar", position: "DC" });
});

test("typed OCC signatures fill only the first empty row and use bold Cochocib formatting", async () => {
  const source = sampleWorkbook();
  const original = unzipSync(new Uint8Array(await source.arrayBuffer()));
  const result = await signOccBriefingWorkbook(signOptions(source, { signatureText: "Nazif" }));
  const archive = unzipSync(new Uint8Array(await result.blob.arrayBuffer()));
  const form = strFromU8(archive["xl/worksheets/sheet2.xml"]);
  const styles = strFromU8(archive["xl/styles.xml"]);

  assert.equal(result.rowNumber, 65);
  assert.equal(result.preservedEntries, 1);
  assert.equal(result.signatureType, "text");
  assert.match(form, /<c r="C65" s="0"><v>1000335<\/v><\/c>/);
  assert.match(form, /<c r="D65" s="0" t="inlineStr"><is><t xml:space="preserve">Muhammad Bin Nazif Jaafar<\/t>/);
  assert.match(form, /<c r="J65" s="2" t="inlineStr"><is><t xml:space="preserve">Nazif<\/t>/);
  assert.match(styles, /<cellXfs count="3">/);
  assert.match(styles, /fontId="1" borderId="7" applyAlignment="1"/);
  assert.match(form, /Existing Staff 1/);
  assert.match(form, /Already signed/);
  assert.deepEqual(archive["xl/drawings/drawing1.xml"], original["xl/drawings/drawing1.xml"]);
  assert.deepEqual(archive["xl/ink/ink1.xml"], original["xl/ink/ink1.xml"]);
});

test("typed OCC signatures create the requested bold script font when it is missing", async () => {
  const result = await signOccBriefingWorkbook(signOptions(sampleWorkbook({ scriptFont: false })));
  const styles = strFromU8(unzipSync(new Uint8Array(await result.blob.arrayBuffer()))["xl/styles.xml"]);
  assert.match(styles, /<fonts count="2">/);
  assert.match(styles, /<font><b\/><sz val="18"\/><color rgb="FF000000"\/><name val="Cochocib Script Latin Pro"\/><\/font>/);
});

test("uploaded signature images are appended without removing existing ink or drawing relationships", async () => {
  const source = sampleWorkbook();
  const result = await signOccBriefingWorkbook(signOptions(source, { signatureFile: signatureImage() }));
  const archive = unzipSync(new Uint8Array(await result.blob.arrayBuffer()));
  const drawing = strFromU8(archive["xl/drawings/drawing1.xml"]);
  const relationships = strFromU8(archive["xl/drawings/_rels/drawing1.xml.rels"]);

  assert.equal(result.signatureType, "image");
  assert.match(drawing, /Existing handwritten signature/);
  assert.match(drawing, /OCC signature row 65/);
  assert.match(drawing, /<xdr:col>9<\/xdr:col>/);
  assert.match(drawing, /r:embed="rId2"/);
  assert.match(relationships, /Type="http:\/\/schemas.openxmlformats.org\/officeDocument\/2006\/relationships\/customXml"/);
  assert.match(relationships, /Target="\.\.\/media\/image2\.png"/);
  assert.deepEqual(archive["xl/media/image2.png"], PNG_BYTES);
  assert.equal(strFromU8(archive["xl/ink/ink1.xml"]), "<ink>preserve existing handwritten signature</ink>");
});

test("uploaded signature images create a Form drawing without replacing another worksheet's drawing", async () => {
  const source = sampleWorkbook({ drawingOnForm: false });
  const result = await signOccBriefingWorkbook(signOptions(source, { signatureFile: signatureImage() }));
  const archive = unzipSync(new Uint8Array(await result.blob.arrayBuffer()));

  assert.match(strFromU8(archive["xl/worksheets/sheet2.xml"]), /<drawing r:id="rId2"\/>/);
  assert.match(strFromU8(archive["xl/worksheets/_rels/sheet2.xml.rels"]), /Target="\.\.\/drawings\/drawing2\.xml"/);
  assert.match(strFromU8(archive["xl/drawings/drawing1.xml"]), /Existing handwritten signature/);
  assert.match(strFromU8(archive["xl/drawings/drawing2.xml"]), /OCC signature row 65/);
  assert.match(strFromU8(archive["[Content_Types].xml"]), /PartName="\/xl\/drawings\/drawing2\.xml"/);
});

test("duplicate sign-ins and full OCC forms never overwrite existing staff", async () => {
  await assert.rejects(
    signOccBriefingWorkbook(signOptions(sampleWorkbook(), { employeeId: "1000200", employeeName: "Existing Staff 1" })),
    /already recorded on row 64/,
  );
  await assert.rejects(signOccBriefingWorkbook(signOptions(sampleWorkbook({ occupiedRows: 3 }))), /All OCC sign-in rows are already occupied/);
});

test("OCC briefing signer appears directly below the Next Day Excel Generator", () => {
  const page = readFileSync(new URL("../src/pages/DepotStabling.jsx", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../src/components/OccBriefingFormSigner.jsx", import.meta.url), "utf8");
  assert.match(page, /<OfficialEastExcelGenerator[\s\S]*?<OccBriefingFormSigner\s*\/>\s*<TrainRequestedNotInRemoval/);
  assert.match(panel, /Existing signatures preserved/);
  assert.match(panel, /Sign & Download OCC Form/);
  assert.match(panel, /Signature image · optional/);
});

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function supportsWorkbookSavePicker() {
  return typeof window !== "undefined" && typeof window.showSaveFilePicker === "function";
}

export async function requestWorkbookSaveHandle(fileName) {
  if (!supportsWorkbookSavePicker()) return null;

  return window.showSaveFilePicker({
    id: "occ-briefing-workbook",
    suggestedName: fileName,
    startIn: "downloads",
    types: [
      {
        description: "Excel workbook",
        accept: { [XLSX_MIME]: [".xlsx"] },
      },
    ],
  });
}

export async function writeWorkbookToHandle(fileHandle, blob) {
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(blob);
    await writable.close();
  } catch (error) {
    if (typeof writable.abort === "function") {
      try {
        await writable.abort();
      } catch {
        // Keep the original write error when cleanup also fails.
      }
    }
    throw error;
  }
}

export function downloadWorkbook(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const PST_EXCEL_COPY_FIRST_ROW = 3;
export const PST_EXCEL_COPY_LAST_ROW = 49;
export const PST_EXCEL_COPY_COLUMN_COUNT = 11;

function normalizeClipboardCell(value) {
  return String(value ?? "")
    .replace(/\t/g, " ")
    .replace(/\r?\n/g, " ");
}

export function buildPSTExcelClipboardText(rows = []) {
  const copyRows = Array.from(
    { length: PST_EXCEL_COPY_LAST_ROW - PST_EXCEL_COPY_FIRST_ROW + 1 },
    (_, index) => {
      const sourceRow = Array.isArray(rows[PST_EXCEL_COPY_FIRST_ROW - 1 + index])
        ? rows[PST_EXCEL_COPY_FIRST_ROW - 1 + index]
        : [];

      return Array.from(
        { length: PST_EXCEL_COPY_COLUMN_COUNT },
        (_, columnIndex) => normalizeClipboardCell(sourceRow[columnIndex]),
      );
    },
  );

  return copyRows.map((row) => row.join("\t")).join("\n");
}

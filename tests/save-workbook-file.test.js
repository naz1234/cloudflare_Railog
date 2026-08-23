import test from "node:test";
import assert from "node:assert/strict";
import {
  requestWorkbookSaveHandle,
  supportsWorkbookSavePicker,
  writeWorkbookToHandle,
} from "../src/lib/saveWorkbookFile.js";

test("OCC workbook save picker suggests the original Excel filename", async () => {
  const originalWindow = globalThis.window;
  const expectedHandle = { name: "OCC Book In and Briefing Form.xlsx" };
  let receivedOptions = null;
  globalThis.window = {
    showSaveFilePicker: async (options) => {
      receivedOptions = options;
      return expectedHandle;
    },
  };

  try {
    assert.equal(supportsWorkbookSavePicker(), true);
    const handle = await requestWorkbookSaveHandle(expectedHandle.name);
    assert.equal(handle, expectedHandle);
    assert.equal(receivedOptions.suggestedName, expectedHandle.name);
    assert.equal(receivedOptions.startIn, "downloads");
    assert.deepEqual(
      receivedOptions.types[0].accept["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
      [".xlsx"],
    );
  } finally {
    globalThis.window = originalWindow;
  }
});

test("OCC workbook save handle writes and closes the signed workbook", async () => {
  const calls = [];
  const blob = new Blob(["signed workbook"]);
  const handle = {
    createWritable: async () => ({
      write: async (value) => calls.push(["write", value]),
      close: async () => calls.push(["close"]),
    }),
  };

  await writeWorkbookToHandle(handle, blob);
  assert.deepEqual(calls, [["write", blob], ["close"]]);
});

test("OCC workbook save picker reports unsupported browsers", () => {
  const originalWindow = globalThis.window;
  globalThis.window = {};
  try {
    assert.equal(supportsWorkbookSavePicker(), false);
  } finally {
    globalThis.window = originalWindow;
  }
});

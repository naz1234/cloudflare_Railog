import { useRef, useState } from "react";
import { Check, Copy, Image as ImageIcon, Loader2, Upload, X } from "lucide-react";

const EMPTY_EXTRACTION = {
  eveningDate: "",
  morningDate: "",
  eveningGToC: [],
  morningGToC: [],
  eveningPM: [],
  morningPM: [],
};

function normalizeTrainList(value) {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set();

  return source.reduce((trains, item) => {
    const match = String(item ?? "").toUpperCase().match(/(?:TS|T)?\s*0*(\d{1,3})\b/);
    if (!match) return trains;

    const train = String(Number(match[1])).padStart(2, "0");
    if (train === "00" || seen.has(train)) return trains;

    seen.add(train);
    trains.push(train);
    return trains;
  }, []);
}

function normalizeExtraction(value = {}) {
  return {
    eveningDate: String(value.eveningDate || "").trim(),
    morningDate: String(value.morningDate || "").trim(),
    eveningGToC: normalizeTrainList(value.eveningGToC),
    morningGToC: normalizeTrainList(value.morningGToC),
    eveningPM: normalizeTrainList(value.eveningPM),
    morningPM: normalizeTrainList(value.morningPM),
  };
}

function normalizeRequestType(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function requestKey(item = {}) {
  const trainId = normalizeTrainList([item.trainId])[0] || "";
  const requestType = normalizeRequestType(item.requestType).toUpperCase();
  return trainId && requestType ? `${trainId}|${requestType}` : "";
}

function buildRequestGroups(extraction = EMPTY_EXTRACTION) {
  const data = normalizeExtraction(extraction);
  const sections = [
    ["evening-g-to-c", data.eveningGToC, "G to C", "G-C", data.eveningDate],
    ["morning-g-to-c", data.morningGToC, "G to C", "G-C", data.morningDate],
    ["evening-pm", data.eveningPM, "PM", "RST PM", data.eveningDate],
    ["morning-pm", data.morningPM, "PM", "RST PM", data.morningDate],
  ];
  const seen = new Set();

  return sections.map(([key, trains, displayLabel, requestLabel, date]) => {
    const requestType = `${requestLabel}${date ? ` ${date.toUpperCase()}` : ""}`;
    const items = trains.reduce((groupItems, trainId) => {
      const item = { trainId, requestType, customType: "", remark: "" };
      const itemKey = requestKey(item);
      if (!itemKey || seen.has(itemKey)) return groupItems;
      seen.add(itemKey);
      groupItems.push(item);
      return groupItems;
    }, []);

    return {
      key,
      title: `${displayLabel}${date ? ` (${date})` : ""}`,
      items,
    };
  });
}

function formatTrainLine(trains = []) {
  return trains.length ? trains.join(", ") : "No train detected";
}

export function buildMaintenanceImageSummary(extraction = EMPTY_EXTRACTION) {
  const data = normalizeExtraction(extraction);
  const eveningDate = data.eveningDate ? ` (${data.eveningDate})` : "";
  const morningDate = data.morningDate ? ` (${data.morningDate})` : "";
  const eveningPmDate = data.eveningDate ? ` ${data.eveningDate}` : "";
  const morningPmDate = data.morningDate ? ` ${data.morningDate}` : "";

  return [
    `G to C${eveningDate}`,
    formatTrainLine(data.eveningGToC),
    "",
    `G to C${morningDate}`,
    formatTrainLine(data.morningGToC),
    "",
    `PM${eveningPmDate}`,
    formatTrainLine(data.eveningPM),
    "",
    `PM${morningPmDate}`,
    formatTrainLine(data.morningPM),
  ].join("\n");
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

export default function MaintenanceImageSummary({ requests = [], onAdd }) {
  const inputRef = useRef(null);
  const analysisIdRef = useRef(0);
  const [fileName, setFileName] = useState("");
  const [extraction, setExtraction] = useState(null);
  const [analysing, setAnalysing] = useState(false);
  const [addingGroupKey, setAddingGroupKey] = useState("");
  const [addedKeys, setAddedKeys] = useState(() => new Set());
  const [addMessage, setAddMessage] = useState({ key: "", type: "", text: "" });
  const [message, setMessage] = useState({ type: "", text: "" });
  const [copied, setCopied] = useState(false);

  const summary = extraction ? buildMaintenanceImageSummary(extraction) : "";

  const clearSelection = () => {
    analysisIdRef.current += 1;
    if (inputRef.current) inputRef.current.value = "";
    setFileName("");
    setExtraction(null);
    setMessage({ type: "", text: "" });
    setAddMessage({ key: "", type: "", text: "" });
    setAddedKeys(new Set());
    setAddingGroupKey("");
    setCopied(false);
    setAnalysing(false);
  };

  const analyseImage = async (file) => {
    if (!file) return;

    const supportedImageType = ["image/png", "image/jpeg", "image/bmp", "image/tiff"].includes(
      String(file.type || "").toLowerCase()
    );
    const supportedImageName = /\.(?:png|jpe?g|bmp|tiff?)$/i.test(file.name || "");
    if (!supportedImageType && !supportedImageName) {
      clearSelection();
      setMessage({ type: "error", text: "Please upload a PNG, JPG, BMP, or TIFF image." });
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      clearSelection();
      setMessage({ type: "error", text: "The image is larger than the Azure Free F0 limit of 4 MB." });
      return;
    }

    setFileName(file.name);
    setExtraction(null);
    setMessage({ type: "", text: "" });
    setAddMessage({ key: "", type: "", text: "" });
    setAddedKeys(new Set());
    setCopied(false);
    setAnalysing(true);
    const analysisId = analysisIdRef.current + 1;
    analysisIdRef.current = analysisId;

    try {
      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch("/api/maintenance-image", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to read the uploaded image.");
      }

      if (analysisId !== analysisIdRef.current) return;

      const normalizedExtraction = normalizeExtraction(payload.extraction);
      setExtraction(normalizedExtraction);
      setMessage({
        type: payload.warning ? "warning" : "success",
        text: payload.warning || "Azure table OCR read the image successfully. Review the generated details before adding them.",
      });
    } catch (error) {
      if (analysisId !== analysisIdRef.current) return;
      setMessage({
        type: "error",
        text: error?.message || "Unable to read the uploaded image.",
      });
    } finally {
      if (analysisId === analysisIdRef.current) setAnalysing(false);
    }
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    analyseImage(file);
  };

  const handleCopy = async () => {
    if (!summary) return;

    try {
      await copyText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setMessage({ type: "error", text: "Unable to copy. Please select and copy the generated details manually." });
    }
  };

  const existingRequestKeys = new Set(
    (requests || []).map((request) => requestKey({
      trainId: request.trainId,
      requestType: request.requestType === "Other"
        ? request.customType || "Other"
        : request.requestType,
    })).filter(Boolean)
  );
  const isRequestAvailable = (item) => {
    const key = requestKey(item);
    return key && !existingRequestKeys.has(key) && !addedKeys.has(key);
  };
  const requestGroups = extraction ? buildRequestGroups(extraction) : [];

  const handleAddGroup = async (group) => {
    if (typeof onAdd !== "function" || addingGroupKey) return;
    const selectedItems = group.items.filter(isRequestAvailable);

    if (selectedItems.length === 0) return;

    setAddingGroupKey(group.key);
    setAddMessage({ key: "", type: "", text: "" });
    const successfulKeys = [];
    let failedCount = 0;

    for (const item of selectedItems) {
      try {
        await onAdd(item);
        successfulKeys.push(requestKey(item));
      } catch {
        failedCount += 1;
      }
    }

    if (successfulKeys.length > 0) {
      setAddedKeys((current) => new Set([...current, ...successfulKeys]));
    }

    if (failedCount > 0) {
      setAddMessage({
        key: group.key,
        type: "error",
        text: `${successfulKeys.length} request${successfulKeys.length === 1 ? "" : "s"} added; ${failedCount} could not be saved.`,
      });
    } else {
      setAddMessage({
        key: group.key,
        type: "success",
        text: `${successfulKeys.length} train${successfulKeys.length === 1 ? "" : "s"} added from ${group.title}.`,
      });
    }
    setAddingGroupKey("");
  };

  return (
    <section className="w-full rounded-xl border border-[#1e4060] bg-[#071e33] p-2 text-slate-100 shadow-inner">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-cyan-500/60 bg-cyan-400/10 text-cyan-300">
            <ImageIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[11px] font-normal uppercase tracking-[1.3px] text-cyan-100">
              Train Plan Image Reader
            </h2>
            <p className="mt-0.5 text-[10px] font-normal leading-snug text-[#4a8ab5]">
              Upload, review, then add the detected G to C and PM trains.
            </p>
          </div>
        </div>

        <div className="flex w-full items-center gap-1.5">
          {fileName && (
            <button
              type="button"
              onClick={clearSelection}
              className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-full border border-rose-500/60 bg-rose-500/10 px-2 text-[10px] font-normal text-rose-200 transition hover:bg-rose-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
            >
              <X className="h-3 w-3" />
              Clear All
            </button>
          )}

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={analysing}
            className="inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-full border border-cyan-400 bg-cyan-500/20 px-2 text-[10px] font-normal text-cyan-100 shadow-sm transition hover:bg-cyan-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:cursor-wait disabled:opacity-65"
          >
            {analysing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {analysing ? "Reading image..." : fileName ? "Replace image" : "Upload image"}
          </button>

          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/bmp,image/tiff,.tif,.tiff"
            onChange={handleFileChange}
            className="sr-only"
          />
        </div>
      </div>

      {fileName && (
        <div className="mt-2 break-all rounded-lg border border-[#27516d] bg-[#091828] px-2 py-1.5 text-[10px] font-normal text-slate-200">
          <span>Selected image:</span> {fileName}
        </div>
      )}

      {message.text && (
        <div
          role="status"
          className={`mt-2 rounded-lg border px-2 py-1.5 text-[10px] font-normal leading-relaxed ${
            message.type === "error"
              ? "border-rose-500/60 bg-rose-500/10 text-rose-100"
              : message.type === "warning"
                ? "border-amber-500/60 bg-amber-500/10 text-amber-100"
                : "border-emerald-500/60 bg-emerald-500/10 text-emerald-100"
          }`}
        >
          {message.text}
        </div>
      )}

      {extraction && (
        <div className="mt-2 overflow-hidden rounded-xl border border-[#2b6282] bg-[#071828]">
          <div className="flex items-center justify-between gap-2 border-b border-[#21445d] bg-[#0c2e4a] px-2 py-1.5">
            <span className="text-[10px] font-normal uppercase tracking-[1.2px] text-cyan-100">
              Review generated details
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex h-6 items-center gap-1 rounded-full border border-cyan-500 px-2 text-[10px] font-normal text-cyan-100 transition hover:bg-cyan-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="max-h-80 divide-y divide-[#21445d] overflow-y-auto">
            {requestGroups.map((group) => {
              const availableItems = group.items.filter(isRequestAvailable);
              const isAddingGroup = addingGroupKey === group.key;

              return (
                <div key={group.key} className="bg-[#071828]">
                  <div className="grid min-h-[58px] grid-cols-[minmax(0,1fr)_58px]">
                    <div className="min-w-0 px-2.5 py-2">
                      <div className="text-[12px] font-normal leading-5 text-white">{group.title}</div>
                      <div className="mt-0.5 break-words text-[12px] font-normal leading-5 text-slate-200">
                        {group.items.length > 0
                          ? group.items.map((item) => item.trainId).join(", ")
                          : "No train detected"}
                      </div>
                    </div>

                    <div className="flex items-center justify-center border-l border-[#21445d] px-1.5 py-2">
                      <button
                        type="button"
                        onClick={() => handleAddGroup(group)}
                        disabled={Boolean(addingGroupKey) || availableItems.length === 0}
                        className="inline-flex min-h-7 w-full items-center justify-center gap-1 rounded-full border border-emerald-400/70 bg-emerald-500/20 px-1 py-1 text-[10px] font-normal text-emerald-100 transition hover:bg-emerald-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isAddingGroup && <Loader2 className="h-3 w-3 animate-spin" />}
                        {isAddingGroup
                          ? "Adding"
                          : group.items.length === 0
                            ? "—"
                            : availableItems.length === 0
                              ? "Added"
                              : "Add"}
                      </button>
                    </div>
                  </div>

                  {addMessage.key === group.key && addMessage.text && (
                    <div
                      role="status"
                      className={`border-t px-2.5 py-1.5 text-[10px] font-normal leading-relaxed ${
                        addMessage.type === "error"
                          ? "border-rose-500/60 bg-rose-500/10 text-rose-100"
                          : "border-emerald-500/60 bg-emerald-500/10 text-emerald-100"
                      }`}
                    >
                      {addMessage.text}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

import { useRef, useState } from "react";
import { Check, Copy, Image as ImageIcon, Loader2, Plus, Upload, X } from "lucide-react";

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

function buildRequestItems(extraction = EMPTY_EXTRACTION) {
  const data = normalizeExtraction(extraction);
  const sections = [
    [data.eveningGToC, "G-C", data.eveningDate],
    [data.morningGToC, "G-C", data.morningDate],
    [data.eveningPM, "RST PM", data.eveningDate],
    [data.morningPM, "RST PM", data.morningDate],
  ];
  const seen = new Set();

  return sections.flatMap(([trains, label, date]) => {
    const requestType = `${label}${date ? ` ${date.toUpperCase()}` : ""}`;
    return trains.reduce((items, trainId) => {
      const item = { trainId, requestType, customType: "", remark: "" };
      const key = requestKey(item);
      if (!key || seen.has(key)) return items;
      seen.add(key);
      items.push(item);
      return items;
    }, []);
  });
}

function normalizeRequestItems(value) {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set();

  return source.reduce((items, entry) => {
    const trainId = normalizeTrainList([entry?.trainId])[0] || "";
    const requestType = normalizeRequestType(entry?.requestType);
    const item = { trainId, requestType, customType: "", remark: "" };
    const key = requestKey(item);
    if (!key || seen.has(key)) return items;
    seen.add(key);
    items.push(item);
    return items;
  }, []);
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
  const [requestItems, setRequestItems] = useState([]);
  const [analysing, setAnalysing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addedKeys, setAddedKeys] = useState(() => new Set());
  const [addMessage, setAddMessage] = useState({ type: "", text: "" });
  const [message, setMessage] = useState({ type: "", text: "" });
  const [copied, setCopied] = useState(false);

  const summary = extraction ? buildMaintenanceImageSummary(extraction) : "";

  const clearSelection = () => {
    analysisIdRef.current += 1;
    if (inputRef.current) inputRef.current.value = "";
    setFileName("");
    setExtraction(null);
    setRequestItems([]);
    setMessage({ type: "", text: "" });
    setAddMessage({ type: "", text: "" });
    setAddedKeys(new Set());
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
    setRequestItems([]);
    setMessage({ type: "", text: "" });
    setAddMessage({ type: "", text: "" });
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
      const normalizedItems = normalizeRequestItems(payload.items);
      setExtraction(normalizedExtraction);
      setRequestItems(normalizedItems.length > 0 ? normalizedItems : buildRequestItems(normalizedExtraction));
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
  const pendingRequestItems = requestItems.filter((item) => {
    const key = requestKey(item);
    return key && !existingRequestKeys.has(key) && !addedKeys.has(key);
  });

  const handleAddToTrainRequest = async () => {
    if (typeof onAdd !== "function" || requestItems.length === 0 || adding) return;

    if (pendingRequestItems.length === 0) {
      setAddMessage({ type: "success", text: "All detected trains are already in Train Request." });
      return;
    }

    setAdding(true);
    setAddMessage({ type: "", text: "" });
    const successfulKeys = [];
    let failedCount = 0;

    for (const item of pendingRequestItems) {
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

    const skippedCount = requestItems.length - pendingRequestItems.length;
    if (failedCount > 0) {
      setAddMessage({
        type: "error",
        text: `${successfulKeys.length} request${successfulKeys.length === 1 ? "" : "s"} added; ${failedCount} could not be saved.`,
      });
    } else if (skippedCount > 0) {
      setAddMessage({
        type: "success",
        text: `${successfulKeys.length} new request${successfulKeys.length === 1 ? "" : "s"} added. ${skippedCount} already existed.`,
      });
    } else {
      setAddMessage({
        type: "success",
        text: `${successfulKeys.length} request${successfulKeys.length === 1 ? "" : "s"} added to Train Request.`,
      });
    }
    setAdding(false);
  };

  return (
    <section className="w-full rounded-xl border border-[#1e4060] bg-[#071e33] p-2 text-slate-100 shadow-inner">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-cyan-500/60 bg-cyan-400/10 text-cyan-300">
            <ImageIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[10px] font-bold uppercase tracking-[1.3px] text-cyan-100">
              Train Plan Image Reader
            </h2>
            <p className="mt-0.5 text-[9px] leading-snug text-[#4a8ab5]">
              Upload, review, then add the detected G to C and PM trains.
            </p>
          </div>
        </div>

        <div className="flex w-full items-center gap-1.5">
          {fileName && (
            <button
              type="button"
              onClick={clearSelection}
              className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-full border border-rose-500/60 bg-rose-500/10 px-2 text-[9px] font-semibold text-rose-200 transition hover:bg-rose-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
            >
              <X className="h-3 w-3" />
              Clear All
            </button>
          )}

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={analysing}
            className="inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-full border border-cyan-400 bg-cyan-500/20 px-2 text-[9px] font-bold text-cyan-100 shadow-sm transition hover:bg-cyan-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:cursor-wait disabled:opacity-65"
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
        <div className="mt-2 break-all rounded-lg border border-[#27516d] bg-[#091828] px-2 py-1.5 text-[9px] text-slate-200">
          <span className="font-semibold">Selected image:</span> {fileName}
        </div>
      )}

      {message.text && (
        <div
          role="status"
          className={`mt-2 rounded-lg border px-2 py-1.5 text-[9px] leading-relaxed ${
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
            <span className="text-[9px] font-bold uppercase tracking-[1.2px] text-cyan-100">
              Review generated details
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex h-6 items-center gap-1 rounded-full border border-cyan-500 px-2 text-[9px] font-bold text-cyan-100 transition hover:bg-cyan-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap px-3 py-2 font-mono text-[11px] font-semibold leading-5 text-white">
            {summary}
          </pre>
          <div className="border-t border-[#21445d] p-2">
            <button
              type="button"
              onClick={handleAddToTrainRequest}
              disabled={adding || requestItems.length === 0 || pendingRequestItems.length === 0}
              className="flex w-full items-center justify-center gap-1.5 rounded-full border border-emerald-400/70 bg-emerald-500/20 py-1.5 text-[10px] font-bold text-emerald-100 transition hover:bg-emerald-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              {adding
                ? "Adding requests..."
                : pendingRequestItems.length === 0 && requestItems.length > 0
                  ? "Already in Train Request"
                  : `Add ${pendingRequestItems.length} to Train Request`}
            </button>
            {addMessage.text && (
              <div
                role="status"
                className={`mt-2 rounded-lg border px-2 py-1.5 text-[9px] leading-relaxed ${
                  addMessage.type === "error"
                    ? "border-rose-500/60 bg-rose-500/10 text-rose-100"
                    : "border-emerald-500/60 bg-emerald-500/10 text-emerald-100"
                }`}
              >
                {addMessage.text}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

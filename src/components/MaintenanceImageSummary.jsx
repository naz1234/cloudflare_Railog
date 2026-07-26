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

export default function MaintenanceImageSummary() {
  const inputRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [extraction, setExtraction] = useState(null);
  const [analysing, setAnalysing] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [copied, setCopied] = useState(false);

  const summary = extraction ? buildMaintenanceImageSummary(extraction) : "";

  const clearSelection = () => {
    if (inputRef.current) inputRef.current.value = "";
    setFileName("");
    setExtraction(null);
    setMessage({ type: "", text: "" });
    setCopied(false);
  };

  const analyseImage = async (file) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMessage({ type: "error", text: "Please upload a PNG, JPG, WEBP, or another image file." });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setMessage({ type: "error", text: "The image is larger than 10 MB. Please upload a smaller image." });
      return;
    }

    setFileName(file.name);
    setExtraction(null);
    setMessage({ type: "", text: "" });
    setCopied(false);
    setAnalysing(true);

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

      setExtraction(normalizeExtraction(payload.extraction));
      setMessage({
        type: payload.warning ? "warning" : "success",
        text: payload.warning || "Image read successfully. Check the generated details before copying.",
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: error?.message || "Unable to read the uploaded image.",
      });
    } finally {
      setAnalysing(false);
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

  return (
    <section className="w-full rounded-xl border border-cyan-300/60 bg-cyan-50 p-3 text-slate-900 shadow-sm dark:border-[#2b6282] dark:bg-[#0b1f33] dark:text-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-cyan-400/70 bg-cyan-100 text-cyan-800 dark:border-cyan-500/60 dark:bg-cyan-400/10 dark:text-cyan-300">
            <ImageIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[12px] font-bold uppercase tracking-[1.6px]">
              Train Plan Image Reader
            </h2>
            <p className="mt-0.5 text-[10px] text-slate-600 dark:text-slate-300">
              Upload the PM planning image to extract G to C and PM train lists by date.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {fileName && !analysing && (
            <button
              type="button"
              onClick={clearSelection}
              className="inline-flex h-7 items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-2 text-[10px] font-semibold text-rose-700 transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 dark:border-rose-500/60 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/20"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          )}

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={analysing}
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-cyan-600 bg-cyan-600 px-3 text-[10px] font-bold text-white shadow-sm transition hover:bg-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:cursor-wait disabled:opacity-65 dark:border-cyan-400 dark:bg-cyan-500/20 dark:text-cyan-100 dark:hover:bg-cyan-500/30"
          >
            {analysing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {analysing ? "Reading image..." : fileName ? "Replace image" : "Upload image"}
          </button>

          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
            onChange={handleFileChange}
            className="sr-only"
          />
        </div>
      </div>

      {fileName && (
        <div className="mt-3 rounded-lg border border-cyan-200 bg-white/75 px-3 py-2 text-[10px] text-slate-700 dark:border-[#27516d] dark:bg-[#071828] dark:text-slate-200">
          <span className="font-semibold">Selected image:</span> {fileName}
        </div>
      )}

      {message.text && (
        <div
          role="status"
          className={`mt-3 rounded-lg border px-3 py-2 text-[10px] leading-relaxed ${
            message.type === "error"
              ? "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-500/60 dark:bg-rose-500/10 dark:text-rose-100"
              : message.type === "warning"
                ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/60 dark:bg-amber-500/10 dark:text-amber-100"
                : "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/60 dark:bg-emerald-500/10 dark:text-emerald-100"
          }`}
        >
          {message.text}
        </div>
      )}

      {extraction && (
        <div className="mt-3 overflow-hidden rounded-xl border border-cyan-300 bg-white dark:border-[#2b6282] dark:bg-[#071828]">
          <div className="flex items-center justify-between gap-3 border-b border-cyan-200 bg-cyan-50 px-3 py-2 dark:border-[#21445d] dark:bg-[#0c2e4a]">
            <span className="text-[10px] font-bold uppercase tracking-[1.4px] text-cyan-900 dark:text-cyan-100">
              Generated details
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex h-6 items-center gap-1 rounded-md border border-cyan-500 px-2 text-[9px] font-bold text-cyan-800 transition hover:bg-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 dark:text-cyan-100 dark:hover:bg-cyan-400/10"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="whitespace-pre-wrap px-4 py-3 font-mono text-[12px] font-semibold leading-6 text-slate-900 dark:text-white">
            {summary}
          </pre>
        </div>
      )}
    </section>
  );
}

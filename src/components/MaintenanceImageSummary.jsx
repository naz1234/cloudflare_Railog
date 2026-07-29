import { useRef, useState } from "react";
import { ChevronRight, Image as ImageIcon, Loader2, Upload, X } from "lucide-react";

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

  const clearSelection = () => {
    analysisIdRef.current += 1;
    if (inputRef.current) inputRef.current.value = "";
    setFileName("");
    setExtraction(null);
    setMessage({ type: "", text: "" });
    setAddMessage({ key: "", type: "", text: "" });
    setAddedKeys(new Set());
    setAddingGroupKey("");
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
        text: "Review and Confirm or Clear All",
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
    <section className="theme-maintenance-upload-card theme-maintenance-upload-card--image w-full overflow-hidden rounded-xl border border-violet-500/70 bg-[radial-gradient(circle_at_12%_28%,rgba(109,40,217,0.22),transparent_34%),linear-gradient(145deg,#0b1228_0%,#101531_58%,#11152d_100%)] p-2 text-slate-100 shadow-[0_0_14px_rgba(139,92,246,0.13)]">
      <style>{`
        @keyframes sabri-reader-add-glow {
          0%, 100% { box-shadow: 0 0 4px rgba(52, 211, 153, 0.42), 0 0 8px rgba(52, 211, 153, 0.22); }
          50% { box-shadow: 0 0 8px rgba(52, 211, 153, 0.95), 0 0 16px rgba(52, 211, 153, 0.58); }
        }
        @keyframes sabri-reader-clear-glow {
          0%, 100% { box-shadow: 0 0 4px rgba(244, 63, 94, 0.42), 0 0 8px rgba(244, 63, 94, 0.22); }
          50% { box-shadow: 0 0 8px rgba(244, 63, 94, 0.95), 0 0 16px rgba(244, 63, 94, 0.58); }
        }
        .sabri-reader-add-glow { animation: sabri-reader-add-glow 1.7s ease-in-out infinite; }
        .sabri-reader-clear-glow { animation: sabri-reader-clear-glow 1.7s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .sabri-reader-add-glow, .sabri-reader-clear-glow { animation: none; }
        }
      `}</style>
      <div className="flex min-w-0 items-center gap-2">
        <div className="theme-maintenance-upload-icon relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-violet-500/30 bg-[linear-gradient(145deg,rgba(35,25,84,0.95),rgba(20,24,61,0.96))] shadow-[inset_0_0_12px_rgba(139,92,246,0.18)]">
          <ImageIcon className="h-4 w-4 text-violet-300" strokeWidth={1.6} />
          <span className="absolute left-1 top-1 h-1.5 w-1.5 rounded-tl-sm border-l border-t border-violet-400" aria-hidden="true" />
          <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-tr-sm border-r border-t border-violet-400" aria-hidden="true" />
          <span className="absolute bottom-1 left-1 h-1.5 w-1.5 rounded-bl-sm border-b border-l border-violet-400" aria-hidden="true" />
          <span className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-br-sm border-b border-r border-violet-400" aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="text-[11px] font-normal leading-tight text-white">Sabri IMG Reader</h2>
          <p className="theme-maintenance-upload-description mt-0.5 text-[9px] font-normal leading-snug text-slate-400">
            Upload, review, then add the detected <span className="theme-maintenance-upload-accent text-violet-300">G to C</span> and <span className="theme-maintenance-upload-accent text-violet-300">PM</span> trains.
          </p>
        </div>

        <span className="theme-maintenance-upload-chevron inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1b1d3d] text-slate-400" aria-hidden="true">
          <ChevronRight className="h-3 w-3" />
        </span>
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={analysing}
        className="theme-maintenance-upload-button mt-1.5 inline-flex h-7 w-full items-center justify-center overflow-hidden rounded-lg border border-violet-400/70 bg-[linear-gradient(90deg,rgba(76,29,149,0.92),rgba(147,51,234,0.88))] text-[10px] font-normal text-white shadow-[0_0_9px_rgba(168,85,247,0.24)] transition hover:brightness-110 active:scale-[0.98] disabled:cursor-wait disabled:opacity-65"
      >
        <span className="theme-maintenance-upload-button-icon inline-flex h-7 w-8 items-center justify-center border-r border-violet-200/20 bg-[#2d185c]/70">
          {analysing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        </span>
        <span className="flex-1 px-2 text-center">
          {analysing ? "Reading..." : fileName ? "Replace Image" : "Upload Image"}
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/bmp,image/tiff,.tif,.tiff"
        onChange={handleFileChange}
        className="sr-only"
      />

      {fileName && (
        <button
          type="button"
          onClick={clearSelection}
          className="sabri-reader-clear-glow mt-2 inline-flex h-7 w-full items-center justify-center gap-1 rounded-full border border-rose-400/80 bg-rose-500/15 px-2 text-[10px] font-normal text-rose-100 transition hover:bg-rose-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
        >
          <X className="h-3 w-3" />
          Clear All
        </button>
      )}

      {fileName && (
        <div className="mt-2 break-all rounded-lg border border-violet-500/30 bg-[#12142d] px-2 py-1.5 text-[10px] font-normal text-slate-200">
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
        <div className="mt-2 overflow-hidden rounded-xl border border-violet-500/40 bg-[#0d1026]">
          <div className="flex items-center gap-2 border-b border-violet-500/25 bg-[#211746] px-2 py-1.5">
            <span className="text-[9px] font-normal uppercase tracking-[1.2px] text-violet-100">
              Review generated details
            </span>
          </div>
          <div className="max-h-80 divide-y divide-violet-500/20 overflow-y-auto">
            {requestGroups.map((group) => {
              const availableItems = group.items.filter(isRequestAvailable);
              const isAddingGroup = addingGroupKey === group.key;

              return (
                <div key={group.key} className="bg-[#0d1026]">
                  <div className="grid min-h-[58px] grid-cols-[minmax(0,1fr)_58px]">
                    <div className="min-w-0 px-2.5 py-2">
                      <div className="text-[11px] font-normal leading-5 text-white">{group.title}</div>
                      <div className="mt-0.5 break-words text-[11px] font-normal leading-5 text-slate-200">
                        {group.items.length > 0
                          ? group.items.map((item) => item.trainId).join(", ")
                          : "No train detected"}
                      </div>
                    </div>

                    <div className="flex items-center justify-center border-l border-violet-500/20 px-1.5 py-2">
                      <button
                        type="button"
                        onClick={() => handleAddGroup(group)}
                        disabled={Boolean(addingGroupKey) || availableItems.length === 0}
                        className={`inline-flex min-h-7 w-full items-center justify-center gap-1 rounded-full border border-emerald-400/80 bg-emerald-500/20 px-1 py-1 text-[9px] font-normal text-emerald-100 transition hover:bg-emerald-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 ${
                          !addingGroupKey && availableItems.length > 0 ? "sabri-reader-add-glow" : ""
                        }`}
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
                      className={`border-t px-2.5 py-1.5 text-[9px] font-normal leading-relaxed ${
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

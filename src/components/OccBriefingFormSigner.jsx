import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Copy,
  FileSignature,
  Loader2,
  TableProperties,
  UserRound,
} from "lucide-react";
import { buildOccBriefingClipboardText } from "../lib/occBriefingClipboard";

const PROFILE_KEY = "occBriefingSignerProfile_v1";
const OCC_SIGNATURE_FONT = "Cochocib Script Latin Pro";

function storedProfile() {
  try {
    const value = JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function currentTime() {
  const now = new Date();
  return [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

async function copyTextToClipboard(text) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall back to the legacy copy path for browsers without clipboard permission.
    }
  }

  if (typeof document === "undefined") return false;

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

export default function OccBriefingFormSigner() {
  const [profile] = useState(storedProfile);
  const [employeeId, setEmployeeId] = useState(profile.employeeId || "");
  const [employeeName, setEmployeeName] = useState(profile.employeeName || "");
  const [position, setPosition] = useState(profile.position || "DC");
  const [timeIn, setTimeIn] = useState(currentTime);
  const [timeOut, setTimeOut] = useState("");
  const [signatureText, setSignatureText] = useState(profile.signatureText || "");
  const [isCopying, setIsCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify({ employeeId, employeeName, position, signatureText }));
    } catch {
      // Copying still works when browser storage is unavailable.
    }
  }, [employeeId, employeeName, position, signatureText]);

  const clearFeedback = () => {
    setError("");
    setCopied(false);
  };

  const handleCopy = async () => {
    clearFeedback();

    const missingFields = [
      ["employee ID", employeeId],
      ["employee name", employeeName],
      ["position", position],
      ["time in", timeIn],
    ]
      .filter(([, value]) => !String(value || "").trim())
      .map(([label]) => label);

    if (missingFields.length) {
      setError(`Complete ${missingFields.join(", ")} before copying.`);
      return;
    }

    setIsCopying(true);
    try {
      const copyText = buildOccBriefingClipboardText({
        employeeId,
        employeeName,
        position,
        timeIn,
        timeOut,
        signature: signatureText,
      });
      const didCopy = await copyTextToClipboard(copyText);
      if (!didCopy) throw new Error("Clipboard copy was not available.");

      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (copyError) {
      setError(copyError?.message || "The OCC row could not be copied.");
    } finally {
      setIsCopying(false);
    }
  };

  return (
    <section className="occ-briefing-signer mt-3 w-full rounded-xl border px-3 py-3">
      <style>{`
        .occ-briefing-signer {
          --occ-bg-start: #101c37;
          --occ-bg-end: #082635;
          --occ-border: rgba(96, 165, 250, 0.58);
          --occ-panel: rgba(7, 22, 40, 0.78);
          --occ-input: #081a2b;
          --occ-text: #eff8ff;
          --occ-muted: #bdd5e8;
          --occ-accent: #7dd3fc;
          --occ-soft: rgba(56, 189, 248, 0.12);
          background: linear-gradient(135deg, var(--occ-bg-start), var(--occ-bg-end));
          border-color: var(--occ-border);
          color: var(--occ-text);
          box-shadow: 0 8px 22px rgba(59, 130, 246, 0.13), inset 0 1px 0 rgba(255,255,255,0.05);
        }
        html[data-app-theme="light"] .occ-briefing-signer {
          --occ-bg-start: #eff6ff;
          --occ-bg-end: #f0f9ff;
          --occ-border: #60a5fa;
          --occ-panel: rgba(255, 255, 255, 0.86);
          --occ-input: #ffffff;
          --occ-text: #142a3e;
          --occ-muted: #4f6980;
          --occ-accent: #0369a1;
          --occ-soft: rgba(14, 165, 233, 0.11);
          box-shadow: 0 8px 20px rgba(59, 130, 246, 0.11), inset 0 1px 0 rgba(255,255,255,0.82);
        }
        .occ-briefing-signer :is(h2, p, label, span, button, input) {
          color: var(--occ-text);
          -webkit-text-fill-color: currentColor;
        }
        .occ-briefing-signer .occ-panel { background: var(--occ-panel); border-color: color-mix(in srgb, var(--occ-border) 48%, transparent); }
        .occ-briefing-signer .occ-label { color: var(--occ-muted); }
        .occ-briefing-signer .occ-accent { color: var(--occ-accent); }
        .occ-briefing-signer .occ-input { background: var(--occ-input); border-color: color-mix(in srgb, var(--occ-border) 66%, transparent); color: var(--occ-text); }
        .occ-briefing-signer .occ-input::placeholder { color: var(--occ-muted); opacity: 0.75; }
        .occ-briefing-signer .occ-input:focus { border-color: var(--occ-accent); box-shadow: 0 0 0 2px var(--occ-soft); }
        .occ-briefing-signer .occ-signature-preview { font-family: "${OCC_SIGNATURE_FONT}", "Brush Script MT", cursive; }
        .occ-briefing-signer .occ-copy-button { color: #ffffff; -webkit-text-fill-color: #ffffff; }
      `}</style>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="occ-accent flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-sky-400/45 bg-sky-400/10">
            <FileSignature className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[12px] font-black uppercase tracking-[0.16em]">OCC Book In & Briefing Row Copy</h2>
            <p className="occ-label mt-0.5 text-[11px] font-medium">Fill in one row, copy it, then paste directly into Excel.</p>
          </div>
        </div>
        <div className="occ-panel occ-accent inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-bold">
          <TableProperties className="h-3 w-3" />
          Excel range C:L
        </div>
      </div>

      <div className="mt-3 grid gap-2.5 lg:grid-cols-[0.8fr_1.35fr_0.7fr]">
        <div className="occ-panel rounded-lg border p-2.5">
          <label htmlFor="occ-signer-id" className="occ-label block text-[10px] font-black uppercase tracking-[0.15em]">Employee ID</label>
          <div className="relative mt-1.5">
            <BadgeCheck className="occ-accent pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
            <input id="occ-signer-id" type="text" inputMode="numeric" value={employeeId} onChange={(event) => { setEmployeeId(event.target.value); clearFeedback(); }} placeholder="e.g. 1000335" className="occ-input h-10 w-full rounded-lg border pl-9 pr-2 text-[11px] font-bold outline-none" />
          </div>
        </div>

        <div className="occ-panel rounded-lg border p-2.5">
          <label htmlFor="occ-signer-name" className="occ-label block text-[10px] font-black uppercase tracking-[0.15em]">Employee name</label>
          <div className="relative mt-1.5">
            <UserRound className="occ-accent pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
            <input id="occ-signer-name" type="text" value={employeeName} onChange={(event) => { setEmployeeName(event.target.value); clearFeedback(); }} placeholder="Enter your name" className="occ-input h-10 w-full rounded-lg border pl-9 pr-2 text-[11px] font-bold outline-none" />
          </div>
        </div>

        <div className="occ-panel rounded-lg border p-2.5">
          <label htmlFor="occ-signer-position" className="occ-label block text-[10px] font-black uppercase tracking-[0.15em]">Position</label>
          <input id="occ-signer-position" type="text" value={position} onChange={(event) => { setPosition(event.target.value); clearFeedback(); }} placeholder="DC" className="occ-input mt-1.5 h-10 w-full rounded-lg border px-3 text-[11px] font-bold outline-none" />
        </div>
      </div>

      <div className="mt-2.5 grid gap-2.5 lg:grid-cols-[0.8fr_0.8fr_1.25fr]">
        <div className="occ-panel rounded-lg border p-2.5">
          <label htmlFor="occ-signer-time-in" className="occ-label flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em]"><Clock3 className="occ-accent h-3.5 w-3.5" /> Time in</label>
          <input id="occ-signer-time-in" type="time" step="1" value={timeIn} onChange={(event) => { setTimeIn(event.target.value); clearFeedback(); }} className="occ-input mt-1.5 h-10 w-full rounded-lg border px-3 text-[11px] font-bold outline-none" />
        </div>

        <div className="occ-panel rounded-lg border p-2.5">
          <label htmlFor="occ-signer-time-out" className="occ-label flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em]"><Clock3 className="occ-accent h-3.5 w-3.5" /> Time out</label>
          <input id="occ-signer-time-out" type="time" step="1" value={timeOut} onChange={(event) => { setTimeOut(event.target.value); clearFeedback(); }} className="occ-input mt-1.5 h-10 w-full rounded-lg border px-3 text-[11px] font-bold outline-none" />
        </div>

        <div className="occ-panel rounded-lg border p-2.5">
          <label htmlFor="occ-signer-signature-text" className="occ-label block text-[10px] font-black uppercase tracking-[0.15em]">Signature</label>
          <input id="occ-signer-signature-text" type="text" value={signatureText} onChange={(event) => { setSignatureText(event.target.value); clearFeedback(); }} placeholder={employeeName || "Defaults to employee name"} className="occ-input occ-signature-preview mt-1.5 h-10 w-full rounded-lg border px-3 text-[17px] font-bold outline-none" />
        </div>
      </div>

      <p className="occ-label mt-2 text-[10px] font-semibold">
        Excel mapping: C ID · D:F Name · G Position · H Time in · I Time out · J:L Signature. A blank signature uses the employee name.
      </p>

      {error && (
        <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-rose-400/45 bg-rose-500/10 px-3 py-2 text-[11px] font-semibold text-rose-300" role="alert">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {copied && (
        <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-[11px] font-semibold text-emerald-300" aria-live="polite">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Copied for Excel columns C:L. Select the empty cell in column C, then paste.</span>
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <button type="button" onClick={handleCopy} disabled={isCopying} className={`occ-copy-button inline-flex h-9 items-center gap-2 rounded-lg border px-4 text-[11px] font-black uppercase tracking-wide text-white shadow-[0_0_16px_rgba(59,130,246,0.24)] transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 ${copied ? "border-emerald-300/70 bg-gradient-to-r from-emerald-600 to-teal-600" : "border-sky-300/70 bg-gradient-to-r from-blue-600 to-cyan-600"}`}>
          {isCopying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : copied ? <ClipboardCheck className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {isCopying ? "Copying..." : copied ? "Copied — Paste at Column C" : "Copy C:L Excel Row"}
        </button>
      </div>
    </section>
  );
}

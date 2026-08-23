import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  Clock3,
  Download,
  FileSignature,
  FileSpreadsheet,
  ImagePlus,
  Loader2,
  ShieldCheck,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import {
  inspectOccBriefingWorkbook,
  OCC_SIGNATURE_FONT,
  signOccBriefingWorkbook,
} from "../lib/occBriefingSignature";

const PROFILE_KEY = "occBriefingSignerProfile_v1";

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
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function downloadWorkbook(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function OccBriefingFormSigner() {
  const sourceInputRef = useRef(null);
  const signatureInputRef = useRef(null);
  const [profile] = useState(storedProfile);
  const [sourceFile, setSourceFile] = useState(null);
  const [workbook, setWorkbook] = useState(null);
  const [employeeId, setEmployeeId] = useState(profile.employeeId || "");
  const [employeeName, setEmployeeName] = useState(profile.employeeName || "");
  const [position, setPosition] = useState(profile.position || "DC");
  const [timeIn, setTimeIn] = useState(currentTime);
  const [timeOut, setTimeOut] = useState("");
  const [signatureText, setSignatureText] = useState(profile.signatureText || "");
  const [signatureFile, setSignatureFile] = useState(null);
  const [signaturePreview, setSignaturePreview] = useState("");
  const [isInspecting, setIsInspecting] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify({ employeeId, employeeName, position, signatureText }));
    } catch {
      // The workbook can still be signed when browser storage is unavailable.
    }
  }, [employeeId, employeeName, position, signatureText]);

  useEffect(() => {
    if (!signatureFile) {
      setSignaturePreview("");
      return undefined;
    }
    const objectUrl = URL.createObjectURL(signatureFile);
    setSignaturePreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [signatureFile]);

  const handleSourceChange = async (event) => {
    const file = event.target.files?.[0] || null;
    setError("");
    setResult(null);
    setWorkbook(null);
    if (!file) {
      setSourceFile(null);
      return;
    }
    if (!/\.xlsx$/i.test(file.name)) {
      setSourceFile(null);
      setError("Upload the OCC Book In and Briefing Form as an .xlsx file.");
      event.target.value = "";
      return;
    }

    setSourceFile(file);
    setIsInspecting(true);
    try {
      const details = await inspectOccBriefingWorkbook(file);
      setWorkbook(details);
      setTimeOut(details.suggestedTimeOut || "");
      if (!details.nextRow) setError("Every sign-in row is occupied. Existing staff entries will not be changed.");
      const savedPerson = details.staff.find((person) => person.employeeId === String(employeeId).trim());
      if (savedPerson) {
        setEmployeeName(savedPerson.name);
        setPosition(savedPerson.position || "DC");
      }
    } catch (inspectionError) {
      setWorkbook(null);
      setError(inspectionError?.message || "The OCC briefing form could not be read.");
    } finally {
      setIsInspecting(false);
    }
  };

  const handleEmployeeIdChange = (event) => {
    const nextId = event.target.value;
    setEmployeeId(nextId);
    setError("");
    setResult(null);
    const person = workbook?.staff.find((staff) => staff.employeeId === nextId.trim());
    if (person) {
      setEmployeeName(person.name);
      setPosition(person.position || "DC");
    }
  };

  const handleEmployeeNameChange = (event) => {
    const nextName = event.target.value;
    setEmployeeName(nextName);
    setError("");
    setResult(null);
    const person = workbook?.staff.find((staff) => staff.name.toLowerCase() === nextName.trim().toLowerCase());
    if (person) {
      setEmployeeId(person.employeeId);
      setPosition(person.position || "DC");
    }
  };

  const handleSignatureChange = (event) => {
    const file = event.target.files?.[0] || null;
    setError("");
    setResult(null);
    if (file && !/^image\/(?:png|jpeg|jpg)$/i.test(file.type) && !/\.(?:png|jpe?g)$/i.test(file.name)) {
      setSignatureFile(null);
      setError("Upload your signature as a PNG or JPG image.");
      event.target.value = "";
      return;
    }
    setSignatureFile(file);
  };

  const clearSignatureImage = () => {
    setSignatureFile(null);
    if (signatureInputRef.current) signatureInputRef.current.value = "";
  };

  const handleSign = async () => {
    setError("");
    setResult(null);
    setIsSigning(true);
    try {
      const signed = await signOccBriefingWorkbook({
        sourceFile,
        employeeId,
        employeeName,
        position,
        timeIn,
        timeOut,
        signatureFile,
        signatureText,
      });
      downloadWorkbook(signed.blob, signed.fileName);
      setResult(signed);
    } catch (signingError) {
      setError(signingError?.message || "The OCC briefing form could not be signed.");
    } finally {
      setIsSigning(false);
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
        .occ-briefing-signer .occ-sign-button { color: #ffffff; -webkit-text-fill-color: #ffffff; }
      `}</style>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="occ-accent flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-sky-400/45 bg-sky-400/10">
            <FileSignature className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[12px] font-black uppercase tracking-[0.16em]">OCC Book In & Briefing Form Signer</h2>
              {workbook?.shift && (
                <span className="occ-accent rounded-full border border-sky-400/40 bg-sky-400/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider">
                  {workbook.shift}
                </span>
              )}
            </div>
            <p className="occ-label mt-0.5 text-[11px] font-medium">Add your sign-in and signature to the first empty row.</p>
          </div>
        </div>
        <div className="occ-panel occ-accent inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-bold">
          <ShieldCheck className="h-3 w-3" />
          Existing signatures preserved
        </div>
      </div>

      <div className="mt-3 grid gap-2.5 lg:grid-cols-[1.2fr_1fr]">
        <div className="occ-panel rounded-lg border p-2.5">
          <label className="occ-label block text-[10px] font-black uppercase tracking-[0.15em]">OCC Book In and Briefing Form</label>
          <input ref={sourceInputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleSourceChange} className="hidden" />
          <button type="button" onClick={() => sourceInputRef.current?.click()} className="occ-input mt-1.5 flex h-10 w-full items-center gap-2 rounded-lg border px-3 text-left transition hover:border-sky-400">
            {isInspecting ? <Loader2 className="occ-accent h-4 w-4 shrink-0 animate-spin" /> : <FileSpreadsheet className="occ-accent h-4 w-4 shrink-0" />}
            <span className="min-w-0 flex-1 truncate text-[11px] font-bold">{sourceFile?.name || "Upload OCC briefing form .xlsx"}</span>
            <Upload className="occ-accent h-3.5 w-3.5 shrink-0" />
          </button>
          {workbook && (
            <p className="occ-label mt-1.5 text-[10px] font-semibold">
              {workbook.date || "Date not provided"} · {workbook.existingCount} existing sign-ins · {workbook.nextRow ? `next empty row ${workbook.nextRow}` : "no empty rows"}
            </p>
          )}
        </div>

        <div className="occ-panel rounded-lg border p-2.5">
          <label className="occ-label block text-[10px] font-black uppercase tracking-[0.15em]">Signature image · optional</label>
          <input ref={signatureInputRef} type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" onChange={handleSignatureChange} className="hidden" />
          <div className="mt-1.5 flex gap-1.5">
            <button type="button" onClick={() => signatureInputRef.current?.click()} className="occ-input flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 text-left transition hover:border-sky-400">
              <ImagePlus className="occ-accent h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-[11px] font-bold">{signatureFile?.name || "Upload signature PNG / JPG"}</span>
            </button>
            {signatureFile && (
              <button type="button" onClick={clearSignatureImage} title="Remove signature image" className="occ-input flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition hover:border-rose-400">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="occ-label mt-1.5 text-[10px] font-semibold">Without an image, your signature uses bold {OCC_SIGNATURE_FONT}.</p>
        </div>
      </div>

      <div className="mt-2.5 grid gap-2.5 lg:grid-cols-[0.8fr_1.35fr_0.7fr]">
        <div className="occ-panel rounded-lg border p-2.5">
          <label htmlFor="occ-signer-id" className="occ-label block text-[10px] font-black uppercase tracking-[0.15em]">Employee ID</label>
          <div className="relative mt-1.5">
            <BadgeCheck className="occ-accent pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
            <input id="occ-signer-id" type="text" inputMode="numeric" list="occ-briefing-staff-ids" value={employeeId} onChange={handleEmployeeIdChange} placeholder="e.g. 1000335" className="occ-input h-10 w-full rounded-lg border pl-9 pr-2 text-[11px] font-bold outline-none" />
          </div>
          <datalist id="occ-briefing-staff-ids">
            {(workbook?.staff || []).map((person) => <option key={person.employeeId} value={person.employeeId}>{person.name}</option>)}
          </datalist>
        </div>

        <div className="occ-panel rounded-lg border p-2.5">
          <label htmlFor="occ-signer-name" className="occ-label block text-[10px] font-black uppercase tracking-[0.15em]">Employee name</label>
          <div className="relative mt-1.5">
            <UserRound className="occ-accent pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
            <input id="occ-signer-name" type="text" list="occ-briefing-staff-names" value={employeeName} onChange={handleEmployeeNameChange} placeholder="Enter or select your name" className="occ-input h-10 w-full rounded-lg border pl-9 pr-2 text-[11px] font-bold outline-none" />
          </div>
          <datalist id="occ-briefing-staff-names">
            {(workbook?.staff || []).map((person) => <option key={person.employeeId} value={person.name}>{person.employeeId}</option>)}
          </datalist>
        </div>

        <div className="occ-panel rounded-lg border p-2.5">
          <label htmlFor="occ-signer-position" className="occ-label block text-[10px] font-black uppercase tracking-[0.15em]">Position</label>
          <input id="occ-signer-position" type="text" value={position} onChange={(event) => setPosition(event.target.value)} placeholder="DC" className="occ-input mt-1.5 h-10 w-full rounded-lg border px-3 text-[11px] font-bold outline-none" />
        </div>
      </div>

      <div className="mt-2.5 grid gap-2.5 lg:grid-cols-[0.8fr_0.8fr_1.25fr]">
        <div className="occ-panel rounded-lg border p-2.5">
          <label htmlFor="occ-signer-time-in" className="occ-label flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em]"><Clock3 className="occ-accent h-3.5 w-3.5" /> Time in</label>
          <input id="occ-signer-time-in" type="time" value={timeIn} onChange={(event) => setTimeIn(event.target.value)} className="occ-input mt-1.5 h-10 w-full rounded-lg border px-3 text-[11px] font-bold outline-none" />
        </div>

        <div className="occ-panel rounded-lg border p-2.5">
          <label htmlFor="occ-signer-time-out" className="occ-label flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em]"><Clock3 className="occ-accent h-3.5 w-3.5" /> Time out</label>
          <input id="occ-signer-time-out" type="time" value={timeOut} onChange={(event) => setTimeOut(event.target.value)} className="occ-input mt-1.5 h-10 w-full rounded-lg border px-3 text-[11px] font-bold outline-none" />
        </div>

        <div className="occ-panel rounded-lg border p-2.5">
          <label htmlFor="occ-signer-signature-text" className="occ-label block text-[10px] font-black uppercase tracking-[0.15em]">{signatureFile ? "Signature preview" : "Signature text · optional"}</label>
          {signaturePreview ? (
            <div className="occ-input mt-1.5 flex h-10 items-center justify-center overflow-hidden rounded-lg border bg-white px-2"><img src={signaturePreview} alt="Signature preview" className="h-8 max-w-full object-contain" /></div>
          ) : (
            <input id="occ-signer-signature-text" type="text" value={signatureText} onChange={(event) => setSignatureText(event.target.value)} placeholder={employeeName || "Defaults to your name"} className="occ-input occ-signature-preview mt-1.5 h-10 w-full rounded-lg border px-3 text-[17px] font-bold outline-none" />
          )}
        </div>
      </div>

      {error && (
        <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-rose-400/45 bg-rose-500/10 px-3 py-2 text-[11px] font-semibold text-rose-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-[11px] font-semibold text-emerald-300">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Signed row {result.rowNumber} and downloaded {result.fileName}. All {result.preservedEntries} existing sign-ins and signatures were preserved.</span>
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <button type="button" onClick={handleSign} disabled={isSigning || isInspecting || !sourceFile || !workbook?.nextRow} className="occ-sign-button inline-flex h-9 items-center gap-2 rounded-lg border border-sky-300/70 bg-gradient-to-r from-blue-600 to-cyan-600 px-4 text-[11px] font-black uppercase tracking-wide text-white shadow-[0_0_16px_rgba(59,130,246,0.24)] transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55">
          {isSigning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          {isSigning ? "Signing..." : "Sign & Download OCC Form"}
        </button>
      </div>
    </section>
  );
}

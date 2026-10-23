import { LockKeyhole } from "lucide-react";

const panelClass = "rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-[#28506d] dark:bg-[#071e33]";

export default function ATSWorkspace({ unlocked = false, onUnlock }) {
  if (!unlocked) {
    return (
      <section className={`${panelClass} mx-auto mt-12 max-w-md p-6 text-slate-800 dark:text-slate-100`} aria-labelledby="ats-locked-heading">
        <LockKeyhole className="mb-4 h-8 w-8 text-cyan-500" aria-hidden="true" />
        <p className="text-xs font-semibold uppercase tracking-widest text-cyan-700 dark:text-cyan-300">Protected page · ATS</p>
        <h1 id="ats-locked-heading" className="mt-2 text-xl font-bold">ATS</h1>
        <p className="my-4 text-sm leading-relaxed text-slate-600 dark:text-slate-400">Unlock the protected pages to access the ATS section.</p>
        <button type="button" onClick={onUnlock} className="rounded-lg border border-cyan-600 bg-cyan-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500">Unlock protected pages</button>
      </section>
    );
  }

  return (
    <section className="theme-ats-workspace w-full" aria-label="ATS track explorer">
      <iframe
        src="/ats/line3/index.html"
        title="Line 3 interactive ATS track diagram"
        className="block h-[calc(100dvh-56px)] w-full border-0 bg-[#223436]"
        allow="fullscreen"
        allowFullScreen
      />
    </section>
  );
}

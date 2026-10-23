import { ExternalLink, LockKeyhole, ShieldCheck, TrainFront } from "lucide-react";

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
    <section className="theme-ats-workspace mx-auto w-full space-y-3 py-2 text-slate-800 dark:text-slate-100" aria-labelledby="ats-heading">
      <header className={`${panelClass} flex flex-wrap items-center justify-between gap-3 px-4 py-3`}>
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-cyan-700 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-300"><TrainFront className="h-6 w-6" aria-hidden="true" /></div>
          <div><p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-[#8aaec5]">Protected section · Line 3</p><h1 id="ats-heading" className="mt-1 text-xl font-bold">ATS · Track Explorer</h1></div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-800 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-200"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />Protected pages unlocked</span>
          <a href="/ats/line3/index.html" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-cyan-600 bg-cyan-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-cyan-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500">Open diagram<ExternalLink className="h-4 w-4" aria-hidden="true" /></a>
        </div>
      </header>
      <div className={`${panelClass} overflow-hidden`}>
        <iframe
          src="/ats/line3/index.html"
          title="Line 3 interactive ATS track diagram"
          className="block h-[calc(100dvh-14rem)] min-h-[480px] w-full border-0 bg-[#223436]"
          allow="fullscreen"
          allowFullScreen
        />
      </div>
      <p className="px-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">22 stations · Search track, signal or point numbers. Use the diagram’s Full screen button for a larger view. No live ATS connection or train controls are configured.</p>
    </section>
  );
}

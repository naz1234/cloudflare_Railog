import { ExternalLink, RefreshCw, ShieldCheck } from "lucide-react";
import { useState } from "react";

export const CMMS_PORTAL_URL = "https://login.flow-metro.com/adfs/ls/IdpInitiatedSignon.aspx?RelayState=RPID%3Dhttps%253A%252F%252Fcmms.flow-metro.com%26RelayState%3Dhttps%253A%252F%252Fcmms.flow-metro.com%252Fmaximo%252Fui%252Fmaximo.jsp";

export default function CmmsEmbeddedBrowser() {
  const [frameKey, setFrameKey] = useState(0);

  return (
    <section
      className="theme-cmms-browser overflow-hidden rounded-2xl border border-[#28506d] bg-[#061827] shadow-[0_14px_34px_rgba(0,0,0,0.22)]"
      aria-labelledby="cmms-browser-title"
      data-cmms-embedded-browser
    >
      <header className="theme-cmms-browser-header flex flex-wrap items-center justify-between gap-3 border-b border-[#21435e] bg-[#09243a] px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="theme-cmms-browser-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-400/35 bg-emerald-400/10 text-emerald-300">
            <ShieldCheck size={20} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="cmms-browser-title" className="theme-cmms-browser-title text-[14px] font-black tracking-wide text-white">
              CMMS Browser
            </h2>
            <p className="theme-cmms-browser-subtitle mt-0.5 text-[10px] font-medium text-[#8eb5d1]">
              Open CMMS without leaving the Train Movement page.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFrameKey((current) => current + 1)}
            className="theme-cmms-browser-secondary inline-flex h-9 items-center gap-2 rounded-lg border border-[#3a6380] bg-[#0a2a43] px-3 text-[10px] font-bold uppercase tracking-[0.08em] text-[#b8d8ec] transition hover:border-cyan-300/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
            aria-label="Reload CMMS browser"
          >
            <RefreshCw size={14} aria-hidden="true" />
            Reload
          </button>
          <a
            href={CMMS_PORTAL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="theme-cmms-browser-primary inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-300/70 bg-emerald-500/20 px-3 text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-100 shadow-[0_0_14px_rgba(16,185,129,0.16)] transition hover:-translate-y-0.5 hover:bg-emerald-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/75"
          >
            Open CMMS
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        </div>
      </header>

      <div className="theme-cmms-browser-notice border-b border-amber-400/25 bg-amber-400/[0.08] px-4 py-2 text-[10px] font-medium leading-relaxed text-amber-100">
        CMMS requires FLOW network access. If your login page is blocked inside this panel, use <span className="font-bold">Open CMMS</span>.
      </div>

      <div className="theme-cmms-browser-frame-shell bg-[#eef2f5] p-2">
        <iframe
          key={frameKey}
          src={CMMS_PORTAL_URL}
          title="FLOW CMMS"
          className="theme-cmms-browser-frame block h-[420px] w-full rounded-xl border border-[#9fb0bc] bg-white sm:h-[480px]"
          referrerPolicy="strict-origin-when-cross-origin"
          loading="lazy"
        />
      </div>
    </section>
  );
}

import { LockKeyhole } from 'lucide-react';

// Use the existing protected-pages session. Do not mount the checklist (or its
// polling/upload controls) until the shared page lock has been unlocked.
export default function Wsh2ProtectedPage({ unlocked = false, onUnlock, children }) {
  if (unlocked) return children;
  return <section className="mx-auto mt-12 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-slate-800 shadow-sm dark:border-[#294b63] dark:bg-[#071827] dark:text-slate-100" aria-label="Locked WSH2 page">
    <LockKeyhole className="mb-4 h-8 w-8 text-sky-500" aria-hidden="true" />
    <p className="text-xs font-semibold uppercase tracking-widest text-sky-600 dark:text-sky-300">Protected page · WSH2</p>
    <h1 className="mt-2 text-xl font-bold">Wash checklist</h1>
    <p className="my-4 text-sm text-slate-500 dark:text-slate-400">Unlock protected pages to upload wash schedules and update the shared checklist.</p>
    <button type="button" onClick={onUnlock} className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-sky-400 hover:text-sky-700 dark:border-[#375a73] dark:bg-[#0b253b] dark:text-sky-100 dark:hover:border-sky-400">Unlock protected pages</button>
  </section>;
}

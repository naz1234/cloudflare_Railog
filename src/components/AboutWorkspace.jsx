import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, GitPullRequest, Info, Loader2, LockKeyhole, RefreshCw, Search } from 'lucide-react';

const REPOSITORY_URL = 'https://github.com/naz1234/cloudflare_Railog';
const MERGED_UPDATES_URL = `${REPOSITORY_URL}/pulls?q=is%3Apr+is%3Amerged+base%3Amain`;
const BUILD = import.meta.env.RAILOG_BUILD || {};

function formatDate(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Unavailable';
  return new Date(value).toLocaleString([], {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

const panelClass = 'rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-[#294b63] dark:bg-[#071827]';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-sky-400 hover:text-sky-700 disabled:cursor-wait disabled:opacity-60 dark:border-[#375a73] dark:bg-[#0b253b] dark:text-sky-100 dark:hover:border-sky-400';

export default function AboutWorkspace({ unlocked, onUnlock }) {
  const [feed, setFeed] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(10);
  const requestRef = useRef(null);

  const loadUpdates = useCallback(async () => {
    if (!unlocked) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/site-updates', {
        credentials: 'same-origin', signal: controller.signal, headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(response.status === 401 || response.status === 403
          ? 'Your login has expired. Sign in again to load updates.'
          : 'Updates could not be loaded. Please try again shortly.');
      }
      const data = await response.json();
      if (!Array.isArray(data.updates)) throw new Error('Updates could not be loaded. Please try again.');
      if (!controller.signal.aborted) setFeed(data);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure.message || 'Updates could not be loaded.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [unlocked]);

  useEffect(() => {
    if (unlocked) loadUpdates();
    const timer = unlocked ? window.setInterval(() => {
      if (document.visibilityState === 'visible') loadUpdates();
    }, 5 * 60 * 1000) : null;
    return () => {
      requestRef.current?.abort();
      if (timer) window.clearInterval(timer);
    };
  }, [loadUpdates, unlocked]);

  const updates = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (feed?.updates || []).filter((update) =>
      `${update.number} ${update.title} ${update.description}`.toLowerCase().includes(query));
  }, [feed, search]);
  const buildCommit = /^[a-f0-9]{40}$/i.test(BUILD.commit || '') ? BUILD.commit : '';
  const buildUpdate = feed?.updates.find((update) => update.commit === buildCommit && buildCommit);

  if (!unlocked) {
    return (
      <section className={`${panelClass} mx-auto mt-12 max-w-md p-6 text-slate-800 dark:text-slate-100`}>
        <LockKeyhole className="mb-4 h-8 w-8 text-sky-500" aria-hidden="true" />
        <p className="text-xs font-semibold uppercase tracking-widest text-sky-600 dark:text-sky-300">Protected page · ABT</p>
        <h1 className="mt-2 text-xl font-bold">About Railog</h1>
        <p className="my-4 text-sm text-slate-500 dark:text-slate-400">Unlock protected pages to view the website version and update history.</p>
        <button type="button" className={buttonClass} onClick={onUnlock}>Unlock protected pages</button>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-5xl space-y-5 px-2 py-4 text-slate-800 dark:text-slate-100" aria-labelledby="about-heading">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.25em] text-sky-600 dark:text-sky-300">Railog · ABT</p>
          <h1 id="about-heading" className="flex items-center gap-2 text-2xl font-bold"><Info className="h-6 w-6 text-sky-500" aria-hidden="true" /> About &amp; updates</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Website version and recent improvements from our GitHub pull requests.</p>
        </div>
        <a className={buttonClass} href={REPOSITORY_URL} target="_blank" rel="noopener noreferrer">View repository <ExternalLink className="h-3.5 w-3.5" /></a>
      </header>

      <div className={`${panelClass} grid gap-5 border-l-4 border-l-sky-500 p-5 sm:grid-cols-2`}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Website version loaded</p>
          <p className="mt-2 font-mono text-2xl font-bold text-sky-700 dark:text-sky-300">{buildCommit ? buildCommit.slice(0, 7) : 'Development preview'}</p>
          {buildUpdate && <p className="mt-2 text-sm">PR #{buildUpdate.number} · {buildUpdate.title}</p>}
          {buildCommit && <a className="mt-2 inline-flex items-center gap-1 text-xs text-sky-700 underline dark:text-sky-300" href={`${REPOSITORY_URL}/commit/${buildCommit}`} target="_blank" rel="noopener noreferrer">View this version <ExternalLink className="h-3 w-3" /></a>}
        </div>
        <div className="text-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Build date</p>
          <p className="mt-2">{formatDate(BUILD.builtAt)}</p>
          <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">This identifies the version open in your browser. Newly merged updates appear below as they are added to the repository.</p>
        </div>
      </div>

      <div className={`${panelClass} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5 dark:border-[#294b63]">
          <div>
            <h2 className="text-base font-bold">Recent merged updates</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Main branch · newest merges first · checks GitHub every 5 minutes while open</p>
          </div>
          <button type="button" className={buttonClass} onClick={loadUpdates} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} {loading ? 'Checking…' : 'Refresh'}
          </button>
        </div>
        <div className="p-5">
          <label className="flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-3 dark:border-[#375a73] dark:bg-[#0b253b]">
            <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <input type="search" aria-label="Search update history" placeholder="Search updates or PR number…" value={search} onChange={(event) => { setSearch(event.target.value); setVisibleCount(10); }} className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-slate-400" />
          </label>
          <div className="mt-3 text-xs text-slate-500 dark:text-slate-400" role="status" aria-live="polite">
            {feed ? `${updates.length} updates${search ? ' matching your search' : ' loaded'} · Last checked ${formatDate(feed.checkedAt)}` : loading ? 'Loading update history from GitHub…' : ''}
          </div>
          {(error || feed?.stale) && <p role="alert" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-600 dark:bg-amber-950/30 dark:text-amber-200">{error || feed.warning}{error && feed ? ' Previously loaded updates are shown below.' : ''}</p>}
          {feed && updates.length === 0 && <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">{search ? 'No updates match your search.' : 'No merged updates are available yet.'}</p>}
          <ol className="mt-4 divide-y divide-slate-200 dark:divide-[#294b63]">
            {updates.slice(0, visibleCount).map((update) => (
              <li key={update.number} className="py-5 first:pt-0">
                <div className="flex items-start gap-3">
                  <span className="mt-1 rounded-lg bg-violet-100 p-2 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300"><GitPullRequest className="h-4 w-4" aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-mono">PR #{update.number}</span><span aria-hidden="true">·</span><time dateTime={update.mergedAt}>{formatDate(update.mergedAt)}</time>
                      {update.commit === buildCommit && buildCommit && <span className="rounded-full bg-sky-100 px-2 py-0.5 font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-200">This version</span>}
                    </div>
                    <h3 className="mt-1.5 break-words text-sm font-semibold leading-6"><a href={`${REPOSITORY_URL}/pull/${update.number}`} target="_blank" rel="noopener noreferrer" className="hover:text-sky-600 hover:underline dark:hover:text-sky-300">{update.title} <ExternalLink className="ml-1 inline h-3 w-3" /></a></h3>
                    {update.description && <details className="mt-2 text-sm text-slate-600 dark:text-slate-300"><summary className="cursor-pointer text-xs text-sky-700 dark:text-sky-300">Read update details</summary><p className="mt-3 whitespace-pre-wrap break-words leading-6">{update.description}</p></details>}
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            {updates.length > visibleCount && <button type="button" className={buttonClass} onClick={() => setVisibleCount((count) => count + 10)}>Show more updates</button>}
            <a href={MERGED_UPDATES_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-sky-700 underline dark:text-sky-300">Full update history on GitHub <ExternalLink className="h-3 w-3" /></a>
          </div>
        </div>
      </div>
    </section>
  );
}

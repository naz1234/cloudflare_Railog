export default function SecureSessionLoading() {
  return (
    <main className="session-loading-screen">
      <header className="brand-lockup">
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" fill="none">
            <rect x="7" y="4" width="18" height="21" rx="6" stroke="currentColor" strokeWidth="1.8" />
            <path d="M11 10h10M11 15h10M12 21l-3 6m11-6 3 6M11 27h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="12" cy="19" r="1.2" fill="currentColor" /><circle cx="20" cy="19" r="1.2" fill="currentColor" />
          </svg>
        </span>
        <div><h1>L3 DC TEMPLATE</h1><p>DEPOT CONTROL</p></div>
      </header>
      <section className="session-check-panel" role="status" aria-live="polite" aria-busy="true">
        <span className="session-check-spinner" aria-hidden="true" />
        <h2>Checking your session…</h2>
        <p>Opening your workspace securely.</p>
      </section>
      <p className="shell-footer">LINE 3 <span>•</span> WEST DEPOT <span>•</span> SECURE ACCESS</p>
    </main>
  );
}

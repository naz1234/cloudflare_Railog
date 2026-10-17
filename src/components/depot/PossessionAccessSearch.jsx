import { useEffect, useId, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Search, X } from "lucide-react";
import { searchPossessionAccessEntries } from "../../lib/possessionAccessLog";
import { HandbackStatusPill } from "./PossessionEntryPicker";

export function PossessionAccessSearchResults({ query, results, onChoose }) {
  if (!query.trim()) return <p className="pss-access-search-hint">Search a full or partial access number to find its PIC.</p>;
  return (
    <>
      <p className="pss-access-search-hint" role="status">{results.length ? `${results.length} matching ${results.length === 1 ? "entry" : "entries"}` : "No matching access number in this depot."}</p>
      {results.length > 0 && <ul className="pss-access-search-results">
        {results.map((result) => <li key={result.entryId}>
          <button type="button" onClick={() => onChoose(result.entryId)}>
            <span><strong>{result.label}</strong><small>{result.accessNumbers.map((number) => `Access #${number}`).join(" · ")}</small></span>
            <HandbackStatusPill waiting={result.waiting} waitingForScd={result.waitingForScd} />
          </button>
        </li>)}
      </ul>}
    </>
  );
}

export default function PossessionAccessSearch({ entries = [], options = [], depotLabel, onValueChange }) {
  const fieldId = useId();
  const hostRef = useRef(null);
  const inputRef = useRef(null);
  const [portalContainer, setPortalContainer] = useState(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const results = searchPossessionAccessEntries(entries, query).map((match) => ({
    ...match,
    ...options.find((option) => option.value === match.entryId),
  }));
  const choose = (entryId) => { onValueChange(entryId); setOpen(false); setQuery(""); };

  useEffect(() => {
    setPortalContainer(hostRef.current?.closest(".app-shell") || null);
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeOnMobile = () => { if (!desktop.matches) { setOpen(false); setQuery(""); } };
    desktop.addEventListener("change", closeOnMobile);
    return () => desktop.removeEventListener("change", closeOnMobile);
  }, []);

  return (
    <div ref={hostRef} className="req-mobile-only pss-access-search">
      <Popover.Root open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setQuery(""); }}>
        <Popover.Trigger type="button" className="pss-access-search-toggle" aria-label={`Search ${depotLabel} access number`} title="Search access number">
          <Search size={14} aria-hidden="true" /><span>Access #</span>
        </Popover.Trigger>
        <Popover.Portal container={portalContainer}>
          <Popover.Content className="req-mobile-only pss-access-search-popup" side="bottom" align="end" sideOffset={6} collisionPadding={12} aria-label={`${depotLabel} access number search`}
            onOpenAutoFocus={(event) => { event.preventDefault(); inputRef.current?.focus(); }}>
            <div className="pss-access-search-heading"><strong>Find access number</strong><Popover.Close type="button" aria-label="Close access number search"><X size={14} aria-hidden="true" /></Popover.Close></div>
            <form onSubmit={(event) => { event.preventDefault(); if (results.length === 1) choose(results[0].entryId); }}>
              <label htmlFor={fieldId}>{depotLabel} · Access number</label>
              <div className="pss-access-search-input-row">
                <input ref={inputRef} id={fieldId} type="search" value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" placeholder="e.g. 303004 or #303004" />
                <button type="submit" disabled={!query.trim()}><Search size={13} aria-hidden="true" />Search</button>
              </div>
            </form>
            <PossessionAccessSearchResults query={query} results={results} onChoose={choose} />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

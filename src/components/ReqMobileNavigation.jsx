import { useState } from "react";
import { ArrowDownToLine, ClipboardList, FileText, Menu, Moon, Settings2, Sun, TrainFront, X } from "lucide-react";

const sections = [
  { key: "stabling", label: "Stabling", icon: TrainFront },
  { key: "requests", label: "Requests", icon: ClipboardList },
  { key: "removal", label: "Removal", icon: ArrowDownToLine },
  { key: "logs", label: "Logs", icon: FileText },
];
const pages = [
  ["depot-stabling", "REQ", "Train Request"], ["train-movement", "MOV", "Train Movement"],
  ["pst-train-prep", "PST", "Train Preparation"], ["insertion", "INS", "Insertion"],
  ["wsh2", "AWP", "Wash Checklist"], ["possession", "PSS", "Possession"],
  ["roster", "ROS", "Roster"], ["sleep", "SLP", "Sleep Mode"],
  ["train-washing", "WSH", "Washing"],
];
const pageKeys = ["stabling", "movement", "pst", "insertion", "wsh2", "possession", "roster", "sleep", "washing"];
const workspaceSections = {
  movement: [["automatic", "Automatic"], ["manual", "Manual"], ["checker", "Checker"]],
  pst: [["trains", "Trains"], ["logs", "Logs"], ["excel", "Excel / Remarks"]],
  insertion: [["trains", "Trains"], ["timetable", "Timetable"], ["logs", "Logs"], ["requests", "Requests"]],
  washing: [["import", "Excel import"], ["manual", "Manual wash"], ["report", "Report"]],
  possession: [["access", "Access"], ["sweeping", "Sweeping"]],
  roster: [["roster", "Daily roster"], ["schedule", "Staff schedule"]],
  sleep: [["trains", "Select trains"], ["logs", "Logs / Excel"]],
};

export default function ReqMobileNavigation({ activePage = "stabling", protectedPagesUnlocked = false, workspaceView, onWorkspaceViewChange, panel, onPanelChange, depot, onDepotChange, depotCounts, logSection, onLogSectionChange, theme, onToggleTheme, toolsOpen, onToggleTools }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const currentPage = pages[pageKeys.indexOf(activePage)] || pages[0];
  const isRequest = activePage === "stabling";
  const pageSections = activePage === "washing" && !protectedPagesUnlocked ? [] : workspaceSections[activePage] || [];
  return <>
    <header className="req-mobile-only req-mobile-header" onKeyDown={(event) => { if (event.key === "Escape") setMenuOpen(false); }}>
      <button type="button" className="req-mobile-icon-button" aria-label="Open page menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
        {menuOpen ? <X size={21} /> : <Menu size={21} />}
      </button>
      <div className="req-mobile-brand"><TrainFront size={25} aria-hidden="true" /><div><strong>L3 Depot</strong><span>{currentPage[2]}</span></div></div>
      <button type="button" className="req-mobile-icon-button" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} onClick={onToggleTheme}>
        {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
      </button>
      <button type="button" className={`req-mobile-icon-button ${toolsOpen ? "is-active" : ""}`} aria-label="Timetable and bookmarks" aria-expanded={toolsOpen} onClick={onToggleTools}><Settings2 size={19} /></button>
      {menuOpen && <nav className="req-mobile-page-menu" aria-label="Application pages">
        {pages.filter(([path]) => path !== "train-washing" || protectedPagesUnlocked).map(([path, code, label]) => <a key={path} href={`#/${path}`} aria-current={path === currentPage[0] ? "page" : undefined} onClick={() => { setMenuOpen(false); window.scrollTo({ top: 0, left: 0, behavior: "auto" }); }}><span>{code}</span>{label}</a>)}
      </nav>}
    </header>
    {((isRequest && panel === "stabling") || ["pst", "insertion", "sleep"].includes(activePage)) && <div className="req-mobile-only req-mobile-depot-switch" role="group" aria-label="Choose stabling depot">
      {["west", "east"].map((key) => <button key={key} type="button" aria-pressed={depot === key} onClick={() => onDepotChange(key)}><span>{key === "west" ? "West Depot" : "East Depot"}</span><strong>{depotCounts[key]}</strong></button>)}
    </div>}
    {isRequest && panel === "logs" && <nav className="req-mobile-only req-mobile-log-nav" aria-label="Log sections">
      {[["removal", "Removal logs"], ["movement", "Movements"], ["summary", "Summary"], ["excel", "Excel"]].map(([key, label]) => <button key={key} type="button" aria-pressed={logSection === key} onClick={() => onLogSectionChange(key)}>{label}</button>)}
    </nav>}
    {isRequest && <nav className="req-mobile-only req-mobile-bottom-nav" aria-label="Train Request sections">
      {sections.map(({ key, label, icon: Icon }) => <button key={key} type="button" aria-pressed={panel === key} onClick={() => onPanelChange(key)}><Icon size={20} aria-hidden="true" /><span>{label}</span></button>)}
    </nav>}
    {!isRequest && pageSections.length > 0 && <nav className="req-mobile-only req-mobile-bottom-nav mobile-workspace-nav" aria-label={`${currentPage[2]} sections`} style={{ gridTemplateColumns: `repeat(${pageSections.length}, minmax(0, 1fr))` }}>
      {pageSections.map(([key, label]) => <button type="button" key={key} aria-pressed={workspaceView === key} onClick={() => onWorkspaceViewChange(key)}><span>{label}</span></button>)}
    </nav>}
  </>;
}

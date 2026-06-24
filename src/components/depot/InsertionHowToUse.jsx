import { useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Copy,
  MousePointerClick,
  RefreshCw,
  Search,
  Undo2,
} from "lucide-react";

const steps = [
  {
    number: "01",
    icon: Search,
    title: "Check the timetable",
    text: "Confirm the active Weekday, Friday, Saturday or PH timetable before entering a TID.",
    detailTitle: "Why this must be checked first",
    details: [
      "Look at the active timetable shown in the TID Reference Table. Confirm that it matches the current operating day: Weekday, Friday, Saturday or Public Holiday.",
      "The active timetable decides which 3-digit TIDs are recognised, the scheduled insertion time, and any Weekday assistance remark such as WD (9am), WD (7pm), ED (9am) or ED (7pm).",
      "A 3-digit number that is not found in the active timetable is not treated as a timetable TID. It remains a manual remark and must be completed with the Insert button.",
      "Do not begin bulk entry when the wrong timetable is active. Correct the timetable first so the timing and TID matching are accurate.",
    ],
    example: "Example: If TID 101 exists in the active Weekday timetable, entering 101 completes automatically. If 101 is not in the active Friday timetable, it is handled as a manual remark.",
    result: "Expected result: the correct operating-day timetable is visible before any entry is made.",
  },
  {
    number: "02",
    icon: RefreshCw,
    title: "Choose PG1 or PG2",
    text: "Use PG1 for the normal plan. Use PG2 when a depot Train ID must be temporarily changed or removed.",
    detailTitle: "Selecting the correct stabling plan",
    details: [
      "PG1 is the normal stabling plan and should be used for routine insertion work when the displayed Train IDs are correct.",
      "PG2 is an editable alternative plan. Select PG2 beside the relevant depot when a Train ID has changed, has been removed, or the actual stabling arrangement is different from PG1.",
      "West Depot and East Depot are controlled separately. Changing West Depot to PG2 does not change the East Depot selection, and the reverse is also true.",
      "Refresh PG2 copies the latest PG1 arrangement into PG2 for that depot. Use it carefully because existing manual PG2 changes may be replaced.",
    ],
    example: "Example: If West Depot ST15 Block 01 shows T09 in PG1 but the actual train is T11, select West PG2 and correct that Train ID before recording its insertion.",
    result: "Expected result: every train is displayed in its actual depot, stabling and block position.",
  },
  {
    number: "03",
    icon: MousePointerClick,
    title: "Find the train",
    text: "Locate the correct Train ID under West or East Depot, then click its TID or remark input box.",
    detailTitle: "How to avoid entering against the wrong train",
    details: [
      "Choose the correct depot first, then locate the correct stabling road and block number.",
      "Confirm the Train ID shown on the card. Train IDs are displayed using two digits, for example T09 rather than T9.",
      "Click the input box belonging to that exact train. Do not use a nearby card even when two trains have similar TIDs or are in the same stabling road.",
      "Before moving to the next train, briefly check that the completed information appears on the same card you selected.",
    ],
    example: "Example: To record T09 at West Depot ST15 Block 01, use the input directly below T09—not another train in ST15.",
    result: "Expected result: the entry is attached to the correct Train ID and physical stabling location.",
  },
  {
    number: "04",
    icon: CheckCircle2,
    title: "Enter a valid TID",
    text: "Type the 3-digit TID. A match in the active timetable completes automatically with its scheduled time.",
    detailTitle: "Automatic timetable TID insertion",
    details: [
      "Enter the complete 3-digit TID in the selected train input, for example 101, 203 or 221.",
      "When the number matches a TID in the active timetable, the page completes the insertion automatically. There is no need to click Insert for a valid timetable match.",
      "The completed card displays the TID and insertion time. On Weekday operations, the applicable assistance remark may also appear as a coloured pill.",
      "Compare the displayed time with the actual completion time. Click the time field and edit it when the real insertion was completed earlier or later than scheduled.",
      "Always check that the TID belongs to the intended train before continuing with the next entry.",
    ],
    example: "Example: Enter 101 under T09. If TID 101 is active, the card may show TID: 101, Time: 05:25 and the applicable Weekday remark.",
    result: "Expected result: the train is marked completed and its insertion line appears in the correct depot log output.",
  },
  {
    number: "05",
    icon: Clock3,
    title: "Enter a remark or sweeping",
    text: "For 3K1, another remark, SW, SW1 or SW2, type the text and click Insert.",
    detailTitle: "Manual entries and sweeping records",
    details: [
      "Use a manual remark when the entry is not a valid TID from the active timetable. Examples include 3K1, testing notes, operational remarks, or a numeric value not found in the active timetable.",
      "After typing the manual remark, click Insert. The card records the remark together with its completion time, which can still be edited.",
      "For sweeping, enter SW, SW1 or SW2 and click Insert. SW or SW1 starts with Track 01, while SW2 starts with Track 02.",
      "After sweeping is created, verify the track, start time and end time. The default end time is generated after the start time, but both times remain editable.",
      "Use the track dropdown to correct Track 01 or Track 02 whenever the actual movement differs from the initial selection.",
    ],
    example: "Examples: Type 3K1 and click Insert for a manual completion. Type SW2 and click Insert for sweeping on Track 02, then verify its start and end time.",
    result: "Expected result: the manual completion or sweeping movement is shown on the train card and included in its relevant log.",
  },
  {
    number: "06",
    icon: Undo2,
    title: "Undo a wrong entry",
    text: "Click the completed TID, remark pill, INSERT COMP. or Sweep text to undo it.",
    detailTitle: "Correcting an insertion without losing the previous input",
    details: [
      "Find the train card containing the incorrect completed entry.",
      "Click the completed TID number, the coloured assistance remark, the manual remark pill, INSERT COMP., or the Sweep text—whichever represents the entry you need to remove.",
      "The completed status is removed, but the previous TID or remark is returned to the input box instead of becoming blank.",
      "Edit the restored value, correct the time or track when required, and complete the entry again.",
      "After correcting it, review the depot log output to confirm the old line has been replaced by the correct information.",
    ],
    example: "Example: If 101 was entered instead of 103, click the displayed 101, change the restored input to 103, and allow the correct TID to complete again.",
    result: "Expected result: the wrong completion is removed and the corrected entry appears without retyping everything from the beginning.",
  },
  {
    number: "07",
    icon: Copy,
    title: "Copy the log",
    text: "Review the West and East log output, then copy only the report that is required.",
    detailTitle: "Final review and copying the report",
    details: [
      "Scroll to the West Depot and East Depot log output above this guide after completing the required train entries.",
      "Check the Train IDs, TIDs, times, depot direction, stabling information and sweeping details before copying.",
      "Use Insertion Only when the report should contain normal insertion entries without sweeping lines.",
      "Use Sweep + 3K1 only when the report should contain sweeping activity together with entries using the 3K1 remark. The 3K1 entries are excluded from Insertion Only.",
      "When a time or entry is corrected on a train card, review the generated output again before pasting it into the operational log.",
    ],
    example: "Example: For the normal insertion report, select Insertion Only. For sweeping activity together with 3K1 insertion entries, select Sweep + 3K1 only.",
    result: "Expected result: only the required, reviewed report is copied and ready to paste into the official log.",
  },
];

export default function InsertionHowToUse() {
  const [openStep, setOpenStep] = useState(null);

  const toggleStep = (number) => {
    setOpenStep((current) => (current === number ? null : number));
  };

  return (
    <section className="insertion-help-shell" aria-labelledby="insertion-how-to-use-title">
      <style>{`
        .insertion-help-shell {
          width: 100%;
          padding: 14px;
          border: 1px solid #2b4f6b;
          border-radius: 12px;
          background: linear-gradient(135deg, rgba(12,46,74,0.62) 0%, rgba(7,24,40,0.98) 100%);
          box-shadow: 0 16px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.04);
        }

        .insertion-help-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 12px;
        }

        .insertion-help-icon {
          width: 34px;
          height: 34px;
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(56,189,248,0.38);
          border-radius: 10px;
          background: rgba(14,116,144,0.20);
          color: #7dd3fc;
        }

        .insertion-help-title {
          color: #ffffff;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 16px;
          line-height: 1.1;
          font-weight: 900;
          letter-spacing: 0.10em;
          text-transform: uppercase;
        }

        .insertion-help-subtitle {
          margin-top: 3px;
          color: #8bbbd6;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 12px;
          line-height: 1.35;
          font-weight: 500;
        }

        .insertion-help-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          align-items: start;
          gap: 8px;
        }

        .insertion-help-step {
          min-width: 0;
          overflow: hidden;
          border: 1px solid #1a3a56;
          border-radius: 10px;
          background: rgba(6,24,39,0.90);
          transition: border-color 160ms ease, background 160ms ease, box-shadow 160ms ease;
        }

        .insertion-help-step:hover,
        .insertion-help-step.is-open {
          border-color: rgba(56,189,248,0.55);
          background: rgba(7,31,50,0.96);
        }

        .insertion-help-step.is-open {
          box-shadow: inset 0 1px 0 rgba(125,211,252,0.06), 0 8px 20px rgba(0,0,0,0.18);
        }

        .insertion-help-trigger {
          width: 100%;
          min-width: 0;
          display: grid;
          grid-template-columns: 34px minmax(0, 1fr) 24px;
          align-items: start;
          gap: 9px;
          padding: 10px;
          border: 0;
          background: transparent;
          color: inherit;
          text-align: left;
          cursor: pointer;
        }

        .insertion-help-trigger:focus-visible {
          outline: 2px solid #38bdf8;
          outline-offset: -2px;
          border-radius: 9px;
        }

        .insertion-help-step-number {
          width: 34px;
          height: 34px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1px;
          border: 1px solid rgba(74,138,181,0.48);
          border-radius: 9px;
          background: rgba(15,45,74,0.76);
          color: #9ed9f7;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 11px;
          line-height: 1;
          font-weight: 900;
        }

        .insertion-help-step-title-row {
          display: flex;
          align-items: center;
          gap: 7px;
          margin-bottom: 3px;
        }

        .insertion-help-step-title {
          color: #e8f6ff;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 13px;
          line-height: 1.2;
          font-weight: 850;
        }

        .insertion-help-open-hint {
          flex: 0 0 auto;
          padding: 2px 6px;
          border: 1px solid rgba(56,189,248,0.24);
          border-radius: 999px;
          color: #7dd3fc;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 10px;
          line-height: 1.2;
          font-weight: 750;
        }

        .insertion-help-step-text {
          color: #9fc0d5;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 12px;
          line-height: 1.48;
          font-weight: 500;
        }

        .insertion-help-chevron {
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-top: 4px;
          border: 1px solid rgba(74,138,181,0.40);
          border-radius: 7px;
          color: #8ecbea;
          background: rgba(15,45,74,0.55);
          transition: transform 180ms ease, color 180ms ease, background 180ms ease;
        }

        .insertion-help-step.is-open .insertion-help-chevron {
          transform: rotate(180deg);
          color: #ffffff;
          background: rgba(14,116,144,0.38);
        }

        .insertion-help-details {
          padding: 0 12px 12px 53px;
          animation: insertionHelpOpen 180ms ease-out;
        }

        .insertion-help-details-inner {
          padding: 11px 12px;
          border-top: 1px solid rgba(74,138,181,0.28);
          border-radius: 0 0 8px 8px;
          background: rgba(3,15,27,0.52);
        }

        .insertion-help-detail-title {
          margin-bottom: 8px;
          color: #d9f2ff;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 13px;
          line-height: 1.3;
          font-weight: 850;
        }

        .insertion-help-detail-list {
          display: grid;
          gap: 7px;
        }

        .insertion-help-detail-line {
          display: grid;
          grid-template-columns: 18px minmax(0, 1fr);
          gap: 7px;
          color: #b9d2e1;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 12px;
          line-height: 1.55;
          font-weight: 500;
        }

        .insertion-help-detail-index {
          width: 18px;
          height: 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-top: 1px;
          border-radius: 50%;
          background: rgba(14,116,144,0.26);
          color: #9ed9f7;
          font-size: 10px;
          line-height: 1;
          font-weight: 850;
        }

        .insertion-help-example,
        .insertion-help-result {
          margin-top: 9px;
          padding: 8px 9px;
          border-radius: 7px;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 12px;
          line-height: 1.5;
          font-weight: 600;
        }

        .insertion-help-example {
          border: 1px solid rgba(245,158,11,0.25);
          background: rgba(120,53,15,0.14);
          color: #fde3a7;
        }

        .insertion-help-result {
          border: 1px solid rgba(34,197,94,0.25);
          background: rgba(20,83,45,0.14);
          color: #bbf7d0;
        }

        .insertion-help-rule {
          margin-top: 9px;
          padding: 9px 11px;
          border: 1px solid rgba(34,197,94,0.30);
          border-radius: 9px;
          background: rgba(20,83,45,0.18);
          color: #bbf7d0;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 12px;
          line-height: 1.45;
          font-weight: 700;
        }

        .insertion-help-rule strong {
          color: #ffffff;
          font-weight: 900;
        }

        @keyframes insertionHelpOpen {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 820px) {
          .insertion-help-grid { grid-template-columns: 1fr; }
          .insertion-help-shell { padding: 10px; }
          .insertion-help-details { padding-left: 10px; padding-right: 10px; }
        }

        @media (max-width: 480px) {
          .insertion-help-trigger {
            grid-template-columns: 34px minmax(0, 1fr) 22px;
            gap: 7px;
            padding: 9px;
          }
          .insertion-help-open-hint { display: none; }
        }

        @media (prefers-reduced-motion: reduce) {
          .insertion-help-step,
          .insertion-help-chevron,
          .insertion-help-details { transition: none; animation: none; }
        }
      `}</style>

      <div className="insertion-help-header">
        <div className="insertion-help-icon" aria-hidden="true">
          <BookOpen size={18} strokeWidth={2.2} />
        </div>
        <div>
          <div id="insertion-how-to-use-title" className="insertion-help-title">How to Use</div>
          <div className="insertion-help-subtitle">Click any step to open its detailed beginner guide</div>
        </div>
      </div>

      <div className="insertion-help-grid">
        {steps.map(({ number, icon: StepIcon, title, text, detailTitle, details, example, result }) => {
          const isOpen = openStep === number;
          const detailsId = `insertion-help-details-${number}`;

          return (
            <article key={number} className={`insertion-help-step${isOpen ? " is-open" : ""}`}>
              <button
                type="button"
                className="insertion-help-trigger"
                aria-expanded={isOpen}
                aria-controls={detailsId}
                onClick={() => toggleStep(number)}
              >
                <div className="insertion-help-step-number" aria-hidden="true">
                  <StepIcon size={12} strokeWidth={2.4} />
                  <span>{number}</span>
                </div>

                <div>
                  <div className="insertion-help-step-title-row">
                    <span className="insertion-help-step-title">{title}</span>
                    <span className="insertion-help-open-hint">{isOpen ? "Close" : "Details"}</span>
                  </div>
                  <div className="insertion-help-step-text">{text}</div>
                </div>

                <span className="insertion-help-chevron" aria-hidden="true">
                  <ChevronDown size={16} strokeWidth={2.4} />
                </span>
              </button>

              {isOpen && (
                <div id={detailsId} className="insertion-help-details">
                  <div className="insertion-help-details-inner">
                    <div className="insertion-help-detail-title">{detailTitle}</div>
                    <div className="insertion-help-detail-list">
                      {details.map((detail, index) => (
                        <div key={detail} className="insertion-help-detail-line">
                          <span className="insertion-help-detail-index" aria-hidden="true">{index + 1}</span>
                          <span>{detail}</span>
                        </div>
                      ))}
                    </div>
                    <div className="insertion-help-example"><strong>Example:</strong> {example.replace(/^Example:\s*/i, "")}</div>
                    <div className="insertion-help-result"><strong>Result:</strong> {result.replace(/^Expected result:\s*/i, "")}</div>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <div className="insertion-help-rule">
        <strong>Easy rule:</strong> A valid TID from the active timetable completes automatically. For any other remark or sweeping entry, click <strong>Insert</strong>.
      </div>
    </section>
  );
}

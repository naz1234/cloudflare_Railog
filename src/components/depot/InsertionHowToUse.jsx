import { BookOpen, CheckCircle2, Clock3, Copy, MousePointerClick, RefreshCw, Search, Undo2 } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: Search,
    title: "Check the timetable",
    text: "Confirm the active Weekday, Friday, Saturday or PH timetable in the TID Reference Table before entering a TID.",
  },
  {
    number: "02",
    icon: RefreshCw,
    title: "Choose PG1 or PG2",
    text: "Use PG1 for the normal stabling plan. Select PG2 beside the relevant depot when a Train ID must be changed or removed.",
  },
  {
    number: "03",
    icon: MousePointerClick,
    title: "Find the train",
    text: "Locate the correct Train ID under West Depot or East Depot, then click its TID or remark input box.",
  },
  {
    number: "04",
    icon: CheckCircle2,
    title: "Enter a valid TID",
    text: "Type the 3-digit TID. When it matches the active timetable, the insertion is completed automatically with its scheduled time.",
  },
  {
    number: "05",
    icon: Clock3,
    title: "Enter a remark or sweeping",
    text: "For 3K1, another remark, SW, SW1 or SW2, type the text and click Insert. The completion or sweeping time can still be edited.",
  },
  {
    number: "06",
    icon: Undo2,
    title: "Undo a wrong entry",
    text: "Click the completed TID, remark pill, INSERT COMP. or Sweep text. The previous input is kept so it can be corrected and inserted again.",
  },
  {
    number: "07",
    icon: Copy,
    title: "Copy the log",
    text: "Review the West and East log output above, then use Sweep Only or Insertion Only to copy the required report.",
  },
];

export default function InsertionHowToUse() {
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
          font-size: 14px;
          line-height: 1.1;
          font-weight: 900;
          letter-spacing: 0.10em;
          text-transform: uppercase;
        }

        .insertion-help-subtitle {
          margin-top: 3px;
          color: #8bbbd6;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 10px;
          line-height: 1.35;
          font-weight: 500;
        }

        .insertion-help-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }

        .insertion-help-step {
          min-width: 0;
          display: grid;
          grid-template-columns: 34px minmax(0, 1fr);
          gap: 9px;
          padding: 10px;
          border: 1px solid #1a3a56;
          border-radius: 10px;
          background: rgba(6,24,39,0.90);
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
          font-size: 9px;
          line-height: 1;
          font-weight: 900;
        }

        .insertion-help-step-title {
          margin-bottom: 3px;
          color: #e8f6ff;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 11px;
          line-height: 1.2;
          font-weight: 850;
        }

        .insertion-help-step-text {
          color: #9fc0d5;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 10px;
          line-height: 1.48;
          font-weight: 500;
        }

        .insertion-help-rule {
          margin-top: 9px;
          padding: 9px 11px;
          border: 1px solid rgba(34,197,94,0.30);
          border-radius: 9px;
          background: rgba(20,83,45,0.18);
          color: #bbf7d0;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 10px;
          line-height: 1.45;
          font-weight: 700;
        }

        .insertion-help-rule strong {
          color: #ffffff;
          font-weight: 900;
        }

        @media (max-width: 820px) {
          .insertion-help-grid { grid-template-columns: 1fr; }
          .insertion-help-shell { padding: 10px; }
        }
      `}</style>

      <div className="insertion-help-header">
        <div className="insertion-help-icon" aria-hidden="true">
          <BookOpen size={18} strokeWidth={2.2} />
        </div>
        <div>
          <div id="insertion-how-to-use-title" className="insertion-help-title">How to Use</div>
          <div className="insertion-help-subtitle">Beginner guide for recording insertion and sweeping</div>
        </div>
      </div>

      <div className="insertion-help-grid">
        {steps.map(({ number, icon: StepIcon, title, text }) => (
          <div key={number} className="insertion-help-step">
            <div className="insertion-help-step-number" aria-hidden="true">
              <StepIcon size={12} strokeWidth={2.4} />
              <span>{number}</span>
            </div>
            <div>
              <div className="insertion-help-step-title">{title}</div>
              <div className="insertion-help-step-text">{text}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="insertion-help-rule">
        <strong>Easy rule:</strong> A valid TID from the active timetable completes automatically. For any other remark or sweeping entry, click <strong>Insert</strong>.
      </div>
    </section>
  );
}

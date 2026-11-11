# Railog — Line 3 Depot Train Request & Stabling

A web application supporting Line 3 Depot Controllers with train requests, West and East Depot stabling, movements, insertion/removal planning, preparation checks and operational log outputs.

[Open the application](https://line3-dc-template.pages.dev/) · [Authentication setup](docs/custom-pin-auth.md) · [AWP checklist guide](docs/wsh2.md)

The app supports desktop/laptop and compact mobile layouts, light/dark themes, and iPhone Home Screen installation. Access requires an authorized session.

> Railog is a recording, coordination and document-preparation tool. It does not control trains, operate HVAC, grant access to the railway, or replace ATS indications and approved operating procedures. Enter confirmed information and review generated outputs before using them in an official log.

## Contents

- [Project overview](#project-overview)
- [Workspace directory](#workspace-directory)
- [User guide](#user-guide)
- [Log outputs and Excel generation](#log-outputs-and-excel-generation)
- [Visual status colours](#visual-status-colours)
- [Architecture and shared data](#architecture-and-shared-data)
- [Local development](#local-development)
- [Cloudflare deployment](#cloudflare-deployment)
- [Security and access](#security-and-access)
- [Troubleshooting](#troubleshooting)
- [Repository guide](#repository-guide)

## Project overview

Railog brings several Depot Controller tasks into one application instead of maintaining separate request lists, stabling notes and manually written output text. The main workflows are:

1. Maintain West and East Depot stabling arrangements and associate maintenance requests with trains.
2. Reference the selected timetable when preparing insertion and removal records.
3. Record Automatic/Manual Area Movement details and generate consistently formatted movement logs.
4. Track PST and train preparation separately, including recorded FLDC verification.
5. Maintain an uploaded wash schedule and share completion details across computers.
6. Keep possession information together by PIC, with access numbers, descriptions, timed events and security messages.
7. Record Sleep/Wake-up events with their depot location and prepare shift-specific Excel data.
8. Generate a new daily E-log workbook from an existing official West/East workbook.

The application is designed around Depot Controller workflows and OCC coordination. Approval to sign in and a protected page's extra UI unlock are different things; neither should be described as an implemented manager/viewer/editor permission system without corresponding server-side enforcement.

### Opening the application

1. Open the application URL and use an approved email address for the normal email-PIN sign-in flow.
2. Complete the security check, then enter the emailed PIN on the same login flow.
3. Select the required workspace. Some additional pages remain hidden until the protected-page UI is unlocked.
4. Confirm the active timetable, depot, date and page selection before editing records.
5. Review save feedback and generated output before copying, downloading or closing the page.

The automatically selected Weekday/Friday/Saturday timetable uses an operating-day cutoff of **02:00 on the device clock**: before that time, the previous operating day still applies. PH is a manual override retained after refresh. This is separate from Sleep/Wake-up Excel shift grouping and the Riyadh date used for FLDC verification. Keep the laptop/phone clock and timezone correct.

## Workspace directory

| Shortcut | Workspace | Main functions | Route |
| --- | --- | --- | --- |
| REQ | Train Request & Stabling | West/East stabling, grouped maintenance requests, train search/highlighting, removal summary and log outputs. | `/#/depot-stabling` |
| MOV | Train Movement | Automatic/Manual Area Movement forms, shared shunter list, editable timing suggestions, previews and saved movement logs. | `/#/train-movement` |
| PST | PST / Train Preparation | Preparation status and times, FLDC verification, APU mismatch checklist, and separate or combined copy/Excel outputs. | `/#/pst-train-prep` |
| INS | Train Insertion | Stabling-based assignments, Tracking IDs or remarks, timetable assistance, Sync from Main, and insertion logs. | `/#/insertion` |
| AWP | Wash Checklist | Excel uploads, shared wash completion, HVAC confirmation, manual wash details, batch entry, train highlighting and Word print output. | `/#/wsh2` |
| PSS | Possession | West/East access entries, multiple access numbers per PIC, per-entry security messages, progress/status dashboard and EPAF workspace. | `/#/possession` |
| SLP | Sleep / Wake-up | Record trains by location and generate depot logs, shift-specific Excel copies and workbook downloads. | `/#/sleep` |

AWP is the current display name of the former WSH2 page. Its existing route, API and storage names are retained for compatibility. The original WSH workspace remains at `/#/train-washing` in the protected-page group. Other protected tools include ODO Reading, Roster and the schematic ATS explorer.

## User guide

### REQ — Train Request & Stabling

REQ is the main place to review the relationship between requests, depot stabling and the removal plan.

**Stabling layout**

- West Depot uses roads WD-ST15, WD-ST14, WD-ST13 and WD-ST12; blocks are displayed from 7 to 1.
- East Depot uses ED-ST02 and ED-ST03; blocks are displayed from 1 to 7.
- Occupied blocks show the Train ID and its displayed remarks. Empty blocks remain visible so the physical arrangement can be read without collapsing the grid.
- In REQ, PST and INS, search one or several trains using `01 02 03` or `01, 02, 03` (T-prefixed IDs also work). Each workspace shares its search between West and East, highlights all matching cards and reports each location plus any trains not found. Other trains stay visible; search does not move trains, edit records or change completion states. Clear or Escape resets the search.
- Copy Stabling and supported image/PDF exports prepare the displayed information for review and reuse.

**Maintenance requests**

Enter the train number or train-number list and request text, then add the request. Requests are grouped under categories such as Workshop Movement, PM, CM, TLC, ATC and Washing. Group-title editing also supports adding trains with the final confirmation action.

The request panel supports title editing, hiding, removing and clearing request groups. Location/status sorting follows the displayed status: West stabling first, East stabling next, workshop, then pending; train numbers are sorted within the same status. Hidden requests are not treated as active visible colour cues.

Hover connections help locate a request train in stabling. Where no matching stabling card exists, the available removal/mainline references can provide the lookup instead. Removal information is a reference to recorded/planned data, not proof that the physical movement has happened.

**Removal summary**

- Select the appropriate timetable/preset and review train, TID, time and remark fields.
- West preset selection drives the matching East preset selection, while each depot retains its own saved rows.
- Timetable-based removal entries and manually recorded HDW entries are not the same input mode.
- In HDW, the normal grid has 40 manual rows. Enter a train, record the removal time or use the current-time action, and select West or East for that row. Populated legacy rows are retained rather than silently discarded.
- The HDW “Total … running in ML” value starts at 40 and subtracts unique valid Train IDs with a valid removal time and an explicit West/East selection. It is a calculation from entered rows, not a live mainline train detector or a general fleet count.

Source references: [`MaintenancePanel.jsx`](src/components/MaintenancePanel.jsx), [`maintenanceRequestSort.js`](src/utils/maintenanceRequestSort.js), [`trainRemHdw40.js`](src/lib/trainRemHdw40.js).

### MOV — Train Movement

The movement workspace has separate Automatic Area and Manual Area forms. They share the shunter options, including ALWANY, but keep their own movement details and outputs.

| Information | Automatic Area | Manual Area |
| --- | --- | --- |
| Train | Train set from the workshop | Train set going to the workshop |
| Common details | Planned/unplanned status, shunter, TP1 arrival time | Planned/unplanned status, shunter, TP1 time |
| Suggested time | Localized at TP1: arrival + 10 minutes | Arrival at Manual Area: TP1 time + 10 minutes |
| Supporting details | CMMS handover number, next wash, optional parking/PST/preparation information | CMMS handover details, next wash and applicable unplanned SR/report details |
| Output | Header plus arrival, preparation/authorization and localization events | Header plus TP1 arrival, preparation/authorization, departure and Manual Area arrival events |

The ten-minute value is an editable software suggestion, not a confirmation of an actual event. Users can correct the times before recording the entry.

Use the preview to check names, Train ID, planned/unplanned wording, next-wash details and handover reference. Copy prepares the current preview; Add to Log adds the movement to the saved output list. Saved logs can then be copied together or exported using the available controls.

The header contains the train/movement type, next wash and CMMS handover reference before the timed event lines. Timed output lines are sorted by their event times; a next-wash date/time is metadata, not the movement's chronological position.

Source references: [`tp1-movement-output-format.test.js`](tests/tp1-movement-output-format.test.js), [`shunter-name-options.test.js`](tests/shunter-name-options.test.js), [`build/`](build/).

### PST — PST / Train Preparation

PST uses West/East stabling cards with separate preparation information. Its own remarks are stored separately from the main REQ maintenance list.

**Recording preparation**

1. Select the correct depot/page and confirm the train's stabling position.
2. Record/check the PST start and completion times. The PST button has its own started/confirming, confirmed and reset cycle.
3. Record Train Prep completion independently; a preparation tick and a PST tick are not interchangeable.
4. Enter the applicable TA/completed-by information.
5. Review the PST / Train Prep Log Output before copying or exporting.

PST cards can receive the shared visual failure/APU cue from an active REQ remark as well as a direct PST remark. This does not import the REQ remark text into PST, tick any checker, or alter the preparation times.

**FLDC Checker**

- Enter the verifier's name before selecting trains.
- The eligible list comes from started/completed PST records with the required recorded timing; it is not automatically every train currently stabled.
- Trains are grouped by stabling road and displayed as two-digit numbers, matching the displayed block order. Eligible manual PST entries without a stabling match remain available under Other PST trains.
- Tick individual trains after actual verification, or use Select all / Confirm when all currently offered trains have been verified.
- Verification is scoped to depot and the current **Asia/Riyadh date**. Newly added PST trains are not silently included in an earlier verification.
- Only successfully saved verification populates Excel columns L–M: `Verified via FLDC?` and `Verified via FLDC by`.
- The FLDC text is available in PST / Train Prep Log Output. Copy PST + FLDC combines the PST summary/events, the existing DC note and the applicable saved FLDC log; it is unavailable when the required data is missing or not ready.

**APU Mismatch SR generator**

The APU checklist is a separate selection used to generate APU mismatch/SR text. It follows the compact stabling-grouped train-selection style. Selecting a checklist train is not itself a maintenance remark, an automatic fitness decision or proof of a completed test.

Source references: [`PstFldcChecklist.jsx`](src/components/PstFldcChecklist.jsx), [`pstFldcVerification.js`](src/lib/pstFldcVerification.js), [`PSTLogOutput.jsx`](src/components/depot/PSTLogOutput.jsx).

### INS — Train Insertion

INS combines a stabling-based train view with the selected timetable, editable Tracking ID/remark inputs and depot-specific logs.

**Normal entry workflow**

1. Check the active timetable before entering TIDs.
2. Choose the correct plan. PG1 is the normal arrangement; PG2 is an editable alternative. West and East page selections are independent.
3. Locate the correct train, road and block, then enter its TID or remark.
4. A three-digit TID found in the active timetable completes automatically using its scheduled information. A numeric value not found in that timetable remains a manual remark; it is not assumed to be a valid timetable service.
5. For a manual remark or a train without a TID, use the compact Insert action beside the Train ID. Review the resulting time and output.
6. Wait for Saved. A completed-looking card with Saving or Failed feedback is not confirmation that another laptop has received the entry.

**Remarks and sweeping records**

- Manual text can include `3K1`, other notes, or sweeping keywords.
- `SW` / `SW1` selects the Track 01 sweeping option; `SW2` selects Track 02. Track and times remain editable.
- Both depots support `SW ATWP`. West output starts from **S108 to ATWP WD**, not from its stabling road; East output retains the selected stabling road and destination **ATWP ED**. Neither ATWP destination is prefixed with `signal`. The saved stabling association remains available for card lookup, editing and undo.
- Review the sweeping start/end times and destination before using the output. These are entered/generated records, not a command to perform a movement.
- Insertion Only and Sweep + 3K1 only are different output selections. The latter contains sweeping and 3K1 entries; 3K1 entries are excluded from Insertion Only.

**Corrections and synchronization**

Clicking a completed TID/remark/sweeping item can undo that completion and restore its previous input for correction. Review the generated log after changing it.

Sync from Main copies the latest relevant main stabling data into the insertion workspace and requires its separate clearing confirmation. Refreshing PG2 can replace that depot's manual PG2 arrangement with the current PG1 arrangement. Neither action should be used as a substitute for checking a failed save.

The shared-save controller retries transient failures, keeps pending input locally and shows Saving / Saved / Failed independently for West and East. Same-field concurrent writes use the last successful save; unrelated queued fields are preserved. Obsolete TID/log input is retained for recovery rather than being attached to a replacement train in the same block.

Source references: [in-app insertion guide](src/components/depot/InsertionHowToUse.jsx), [`insertionLiveSync.js`](src/lib/insertionLiveSync.js), [`insertion-live.js`](functions/api/insertion-live.js).

### AWP — Automatic Washing Plant Checklist

AWP turns uploaded wash Excel reports into a shared, editable checklist. On desktop, the checklist is on the left and Uploaded Excel files/batch completion are on the right. On smaller screens, the panels stack. Completion, progress percentage and remaining washes appear in the compact header.

**Upload and review**

Upload `.xlsx` reports containing `Train Number` and `Next Wash` headers. Optional source location/last-wash information is retained. Each workbook can contain up to 500 entries, with limits of 5 MB compressed and 32 MB expanded. An invalid row rejects that workbook with a sheet/row explanation; other successfully imported files remain available.

The page shows uploaded dates and both depots together. Dates come from the workbook, not the current laptop date. Search using a short Train ID such as `01`: matching rows are highlighted without removing the rest of the schedule.

| Checklist field | Behaviour |
| --- | --- |
| Train Number | Identifies the imported train; source asset labels can be longer than the short search ID. |
| Next Wash | Scheduling date/time read from the workbook. |
| Location | Editable OPE/MAINT choice. An unrecognised imported value is preserved until explicitly changed. |
| Done | Records completed wash. Ticking it also records HVAC ON in the same save. |
| HVAC ON | Can be corrected independently. Unchecking clears confirmation; it does not write OFF. |
| PARTIAL / FULL — WD or ED | A blank manual text field, not automatic dropdown selections. Enter details such as `Partial / WD` or `Full / ED`; the maximum is 120 characters. |

Unticking Done does not erase separately recorded HVAC or manual wash details. These fields record checklist information; they do not operate train equipment.

**Batch completion**

1. Under Uploaded Excel files, choose the exact file/date in Batch wash completion.
2. Enter train numbers such as `01 02 03 04 05`. Spaces, line breaks, commas and semicolons are accepted; repeated numbers count once. Valid short numbers are 01–47.
3. Review the highlighted rows and selected date before submitting.
4. Submit completed wash marks those rows Done with HVAC ON. Locations and manually typed wash details remain unchanged.

All requested trains must belong to the selected file/date. Revision and ownership checks are applied as one batch: either all selected rows update, or none do. A stale row requires refreshed data and a retry; the page must not report a partial batch as fully saved.

**Files, reuploads and print output**

- Original uploaded workbooks are downloadable from the private shared store.
- Re-importing scheduling information preserves existing completion/location/HVAC/manual details for the matching train/date instead of resetting the checklist.
- Print / Word opens a picker for **one or two uploaded Excel files**. It exports current rows sourced from those files, including saved completion details.
- The A4 Word layout uses the paper-style date labels, seven columns and blank writing rows. It supports at most two tables of 19 trains; a selection needing more is blocked rather than silently dropping rows or producing extra pages.
- Superseded files with no current rows cannot be selected for print.
- Confirmed Delete removes the original R2 file and its currently sourced checklist rows for everyone. Re-uploading does not restore deleted completion details; download needed originals first.

Full import, revision, storage and print rules: [AWP checklist guide](docs/wsh2.md).

### PSS — Possession, PICs and Security Messages

PSS has West Depot, East Depot and EPAF tabs. Use one access entry for a PIC, then Add Access Number for another permit/description belonging to that same PIC. Use New PIC/Add Another Access when the PIC is different.

Each entry can record PIC name/ID, one or more access numbers with their own descriptions, issue time, access point, access authorization time, SCD information and handback time. Enter actual confirmed times; generating a message does not grant access or possession authority.

**Dashboard counts**

| Metric | What is counted |
| --- | --- |
| Access issued | Unique access numbers with a valid recorded issue time. |
| PICs | Distinct recorded PIC identities, using normalized ID/name information. |
| Handed back | Issued access numbers recorded as handed back. A repeated permit remains open while an issued record for it lacks a valid handback time. |
| PICs waiting for handback | PICs with at least one issued access that has not been recorded as handed back. |

The entry picker uses status pills for Waiting for issue, Waiting for SCD applied and Waiting for handback, based on the recorded fields. A valid handback removes the pending status. A status pill describes the record's completeness, not an independently detected site condition.

**Working with entries and outputs**

1. Select an entry by PIC, or use Access # search to find its access number.
2. Keep different descriptions alongside the correct access numbers within that entry.
3. Choose Entry log, Security or All logs for the required output.
4. Review timed events: they are sorted within the PIC's entry, and combined output separates PIC sections with a divider.
5. Use the corresponding copy button rather than retyping names and access details.

Every access entry has its own security message and copy action. PIC name, access numbers and descriptions come from that entry automatically; phone, location and gate details remain that entry's additional manual fields. One PIC's security information must not move to another PIC when entries are removed or reordered.

Remove deletes the selected entry. Clear all PICs asks for confirmation, clears the current depot's PIC/access/security output state and returns to one blank entry; it does not clear the other depot, EPAF or sweeping workspace. Check the selected depot and preserve any required output first. EPAF is a separate workspace rather than an extra form inside both depot tabs.

Source references: [`possessionAccessLog.js`](src/lib/possessionAccessLog.js), [`PossessionEntryPicker.jsx`](src/components/depot/PossessionEntryPicker.jsx), [`PossessionAccessSearch.jsx`](src/components/depot/PossessionAccessSearch.jsx).

### SLP — Sleep / Wake-up

SLP records Sleep/Wake-up events using the selected trains, stabling location, time and optional remark. It provides separate West/East log outputs and Excel actions. Location is part of the data for every shift, not just the night shift.

**Recording and correcting entries**

- Select the relevant train(s), check the location/time and record Sleep or Wake-up mode.
- Review the grouped output under Sleep Mode and Wake-up Mode before copying it.
- Clear one train when only that train needs resetting: it returns to Ready and is removed from that train's Sleep/Wake-up log history. Other trains in a shared log entry remain represented.
- Individual log deletion and Clear All affect saved records; copying or downloading an output does not clear them.

**Excel shift boundaries and paste locations**

The Excel grouping uses the recorded event time, with these minute-based boundaries:

| Shift | Recorded time | Copy range | Start pasting at |
| --- | --- | --- | --- |
| Night | 23:30–23:59 and 00:00–07:29 | `B4:F50` | `B4` |
| Early | 07:30–15:29 | `H4:L50` | `H4` |
| Late | 15:30–23:29 | `N4:R50` | `N4` |

Each shift copy is a 47-row, five-column block: Date, Location, Sleep time, Wake-up time and Alarm/Observation. It deliberately leaves out the Train set column and headers, while retaining blank rows for unrecorded trains. Paste into the matching template's first Date cell; do not paste into its Train set column or remove blank rows before pasting.

The main workbook download contains all three shift sections. Repeated events are summarized using the first Sleep and last Wake-up event in the relevant grouping, with recorded remarks retained. Review the event date, location and shift before using the export.

Source references: [`sleepModeLog.js`](src/lib/sleepModeLog.js), [`sleepModeExcel.js`](src/lib/sleepModeExcel.js).

### Additional protected workspaces

These pages use the additional protected-page UI unlock after normal application authentication. The unlock is not a separate server-side role or permission grant.

| Workspace | Purpose and limits |
| --- | --- |
| ODO Reading | Record train mileages and workshop flags, apply a workshop Train ID list, prepare ODO output and process the supported CMMS PDF information. Shared ODO records use a dedicated revision-checked API so they can be loaded on another laptop. |
| Roster | Roster and night-shift file/import workflows. This is in the protected group rather than the ordinary main shortcuts. |
| Original WSH | Retained legacy Train Washing workspace. AWP is the ordinary washing shortcut; the legacy workspace keeps its existing route. |
| ATS | Schematic Line 3 reference with station search, asset inspection, pan/zoom, one/two/three-panel layouts and browser-local notes. No live ATS feed or train control. |
| Alarm, Overtime and Admin | Additional protected workspaces. Availability of the UI does not prove a distinct backend viewer/editor role has been implemented. |

See the [ATS guide](docs/ats-track-explorer.md) for its separate diagram files and storage limitations.

## Log outputs and Excel generation

### Choosing the right output

| Output | Intended use | Checks before copying/downloading |
| --- | --- | --- |
| Stabling copy / supported PDF or image | Reuse the displayed depot arrangement. | Correct depot, train positions, active remarks and any search/view context. |
| MOV preview / saved log copy / Excel | Movement text from the current form or saved entries. | Train, shunter, movement direction, planned/unplanned status, times and CMMS reference. |
| PST / Train Prep output | Preparation summary and timed records. | Depot/page selection, PST versus Train Prep state, times and completed-by information. |
| FLDC log / Copy PST + FLDC | Saved verification separately or combined with PST. | Current depot/date, verifier name, saved selections and data readiness. |
| INS Insertion Only | Normal insertion report without sweeping/3K1 entries. | Active timetable, TIDs, times and corrected entries. |
| INS Sweep + 3K1 only | Sweeping and 3K1-specific output. | Track/destination, start/end times and included train list. |
| PSS Entry / Security / All logs | One PIC's operational text, their security message, or combined entry sections. | Matching PIC/access descriptions and the appropriate output type. |
| SLP shift copy / full workbook | Template-ready shift data or all shift sections. | Correct shift, location, date and target paste cell. |
| AWP Print / Word | One-page paper-style wash checklist. | Selected source files, current rows, saved ticks/details and print capacity. |

Copying prepares clipboard content; it does not automatically write an external E-log. Downloading prepares a file; it does not upload it into another system. Review the destination document after pasting or opening an export.

### Next Day Excel Generator

The generator creates a fresh dated West/East official E-log from a previous workbook. It is different from exporting today's live PST, SLP or wash data.

**Inputs and sequence**

1. Upload the previous day's appropriate official `.xlsx` workbook. Keep the expected East/West E-log filename structure so the depot can be detected.
2. Enter the night-shift controller name.
3. Select Today or Tomorrow and review the displayed date/depot.
4. Generate the workbook and read any validation error before treating the export as complete.
5. Open the generated workbook and inspect the main log, dates, daily-reset sheets and retained handover information before operational use.

**What the generator handles**

- Detects West/East from the source filename and applies the matching workbook layout/category handling.
- Updates daily dates and controller-related fields while preserving unrelated worksheets.
- Keeps the official main-log headings, normalizes daily-row merges, and vertically centers Summary text. The matching removal log is placed first when available.
- Clears daily PST/Train Prep body content, including both FLDC verification columns. The data rows become white with black text, retaining relevant borders/number formats rather than inheriting yesterday's yellow/grey fills.
- Preserves an existing PST summary formula at the normalized last row, row 50; supported templates without that formula are also handled.
- Resets Sleep/standby data while retaining the train-set structure where that sheet exists.
- Updates the Point Functional Test sheet for the target date and entered controller using its template rules.

Use the previous day's workbook so retained information such as New Notices and Briefing, Outstanding Faults, Active Restrictions and Other Handover Notes remains available. The generator cannot decide whether those notes are still operationally valid; review them separately. A newly generated workbook must not inherit yesterday's FLDC verification as if it were today's check.

The generator's validation errors should be resolved against the source template. Do not work around an error by deleting sheets, formulas or operational notes merely to obtain a download.

Source references: [`OfficialEastExcelGenerator.jsx`](src/components/OfficialEastExcelGenerator.jsx) (handles both depots), [`official-pst-clean-reset.test.js`](tests/official-pst-clean-reset.test.js), [`official-workbook-log-layout.test.js`](tests/official-workbook-log-layout.test.js).

## Visual status colours

Dark-mode card surfaces help distinguish requested conditions without changing the underlying train/work records.

| Cue | Where used | Meaning |
| --- | --- | --- |
| Burgundy / amber UNFIT surface | REQ and INS for UNFIT; REQ/INS/PST for the supported failure/APU remarks | Visual warning based on the active displayed remark. |
| Plum / lavender surface | REQ and INS | Least-priority remark. |
| Teal / aqua surface | REQ and INS | Deep-clean remark. |
| Muted teal Tracking ID input | INS | Quiet Tracking ID entry styling, separate from maintenance tags. |
| Muted amber 3K1 pill | INS | The two-line 3K1/time remark, distinct from normal Tracking ID styling. |

The shared failure/APU matcher recognizes bare `APU`, `APU ALARM`, `APU Mismatch`, `APU Missmatch`, existing `APU MIS` shorthand, `CC Technical Failure`, `CC Technical`, the short form `CC TECH`, and `Technical Failure`. The `Tehnical` spelling is supported too; matching normalizes case, punctuation and spacing. Unrelated text such as APU TEST is not made a warning just because it contains APU.

These card colours are visual cues only: they do not change train fitness, PST/Prep completion, checker selections or recorded times. Light-mode styling is separate. The shared matching rules are in [`src/lib/reqStablingRemarkTheme.js`](src/lib/reqStablingRemarkTheme.js).

## Architecture and shared data

- **Frontend:** React, Vite, Tailwind CSS and hash-based routing.
- **Backend:** Cloudflare Pages Functions, with D1 for shared application records.
- **Uploaded wash workbooks:** a private R2 bucket, accessed through authenticated Functions.
- **Email login:** server-side session verification, Cloudflare Turnstile and a private email Worker. Cloudflare Access is the source-code default and retained rollback mode; the configured deployment selects the authentication mode.

The original Base44-style entity interface is retained for compatibility, but [`src/api/base44Client.js`](src/api/base44Client.js) sends requests to this repository's Cloudflare API.

INS uses revision-checked field updates, automatic retries, local pending-input recovery and Saving / Saved / Failed feedback for both depots. Concurrent edits to the same train field use the last successful save; unrelated queued changes are preserved. Sync from Main has a separate confirmation because it can clear insertion TIDs/logs.

AWP stores checklist rows in D1 and original uploads in R2, allowing signed-in users on different computers to see the same records. It uses revision checks and refreshes while visible, on focus and on reconnection. Browser preferences and some drafts remain local; ATS notes and saved stations are browser-local, not shared operational data. A pending or failed save must not be treated as saved.

The ATS explorer is a schematic reference, not a live ATS feed, routing system or interlocking interface. See the [ATS guide](docs/ats-track-explorer.md).

### Storage boundaries

| Information | Storage/scope | Important limitation |
| --- | --- | --- |
| Main application records | D1 through authenticated Pages Functions | Another computer must use the same deployed environment and database bindings. |
| INS shared snapshot | D1, revision-checked field updates | The last successful write wins for a concurrently edited same field. |
| INS pending/retained input | Browser-local recovery/outbox plus the shared save process | Browser-local recovery is not proof of a cloud save; avoid clearing storage with pending input. |
| AWP checklist state | D1, train/date rows and revisions | Completed wash, HVAC and manual details are shared, not tied to one laptop. |
| AWP original workbooks | Private R2 objects referenced by D1 upload records | A source download is different from a current checklist Word export. |
| ODO readings and supported report state | Dedicated D1-backed API and browser recovery cache | A local recovery cache is not proof of a successful shared save; check the save feedback. |
| UI preferences and protected-page unlock | Browser/tab-specific state as implemented by each feature | A different browser or laptop may need its own UI unlock/preferences. |
| ATS notes and saved stations | Browser-local storage | These are not synchronized to the operational database. |

This is not an offline-first application. Some features retain drafts or pending edits, but authentication, shared-data loading and successful saves depend on connectivity and the configured services. Do not use a local cache, a generated preview or an approximate online-presence count as independent confirmation of operational activity.

### Desktop, mobile and iPhone installation

- Desktop layouts retain the multi-panel depot/workspace views.
- Mobile workspaces use compact forms, road-by-road stabling lists and workspace-specific bottom navigation. Buttons and long tables use the relevant mobile layout rather than simply scaling the whole desktop page down.
- Light/dark selection affects appearance, not stored records.
- Install from Safari using Share > Add to Home Screen, enabling Open as Web App when offered. Launch the Home Screen icon rather than a normal browser bookmark to use standalone mode.
- An old shortcut may need to be removed and added again after installation metadata changes. External links can still open a browser.
- The site cannot remove the iOS home indicator. Safe-area spacing protects its own navigation/content, but physical iPhone testing is still required for toolbar, rotation, keyboard and last-row behaviour.

See the [iPhone Home Screen guide](docs/iphone-web-app.md). A desktop responsive preview is not a replacement for testing an installed iPhone web app.

## Local development

Install Node.js and npm. The current development checks have been run with Node.js 24. Use the committed lockfile:

```sh
git clone https://github.com/naz1234/cloudflare_Railog.git
cd cloudflare_Railog
npm ci
npm run dev
```

Open the local URL printed by Vite. **Vite alone serves the frontend; it does not emulate Pages Functions, D1, R2 or authentication.** Full login and shared-data workflows require a configured Cloudflare-compatible backend. `npm run preview` also serves only the built frontend.

Do not place Cloudflare secrets in `VITE_*` variables or frontend source: those values can become part of the browser bundle. Do not point a sample-data preview at a production API merely to avoid configuring local storage/authentication.

For an isolated sample-data component preview, run:

```sh
node scripts/preview-compact-slate.mjs
```

Open `http://127.0.0.1:4192/compact-slate-preview`. This loopback-only preview substitutes a local API adapter and blocks `/api/*` requests; it is not the full signed-in app. The [AWP guide](docs/wsh2.md#local-preview-and-storage-verification) documents its separate local D1/R2 preview and additional tooling requirements.

### Checks

```sh
npm test
npm run lint
npm run build
```

- `npm test` uses Node's built-in test runner for unit, component-rendering and API regression tests.
- `npm run lint` runs the repository's configured ESLint checks.
- `npm run build` creates `dist/` and applies the compatibility transforms in `build/`.
- `npm run typecheck` is available for additional TypeScript/JSDoc diagnostics.

Keep the build transforms in mind when editing movement or PST code: production behaviour can include transformations not present in an unconfigured frontend-only preview. Use the relevant production-output regression tests as well as visual checks.

### Suggested verification by change type

| Change | Minimum relevant checks |
| --- | --- |
| Request/remark matching | Matcher tests plus real REQ, INS and PST component-rendering tests; confirm light-mode scope and unchanged work status. |
| Movement output/timing | Local and production-transformed output tests; planned/unplanned cases, editable overrides and midnight handling where affected. |
| INS/ODO synchronization | Revision races, retries, same-field versus unrelated edits, pending recovery and a separate-session non-production check. |
| AWP storage/import | Workbook validation, revision conflict/batch atomicity, original-download/deletion behaviour and local D1/R2 verification. |
| Excel/Word output | Reopen/inspect the generated file, including dates, formulas, styles, headers, row counts and print limits. |
| Mobile layout | Check relevant phone views and desktop layout separately; use a physical iPhone for Home Screen/toolbar claims. |
| Authentication | Isolated unit/preview checks and the documented security checklist; do not email a real user's mailbox just to test configuration. |

Use synthetic fixtures instead of real staff, possession, mileage or incident records. An automated build/test pass does not mean every physical-device or production-account flow has been interactively checked.

## Cloudflare deployment

The main application is deployed to Cloudflare Pages from this repository:

| Setting | Value |
| --- | --- |
| Repository root | This directory |
| Build command | `npm run build` |
| Build output | `dist` |
| Production branch | `main` |

Deploy the frontend and the root `functions/` directory together. [`wrangler.example.toml`](wrangler.example.toml) is a configuration template, not a ready-to-use production configuration.

| Binding | Purpose |
| --- | --- |
| `DB` | D1 database for application records, authentication tables and AWP checklist rows. |
| `WSH2_FILES` | Private R2 bucket for original AWP Excel uploads. |
| `AUTH_EMAIL_SERVICE` | Private email Worker service binding when using custom email-PIN login. |

Before enabling a new environment:

1. Configure authentication using the [email-PIN guide](docs/custom-pin-auth.md) and retained [Cloudflare Access guide](docs/cloudflare-access.md). Do not disable a working authentication gate until its replacement is verified.
2. Configure the required bindings and encrypted secrets for that environment. Use separate preview resources for development checks, not live operational data.
3. Apply pending SQL migrations from [`migrations/`](migrations/) in numeric order. Back up existing databases; do not delete or recreate production tables to apply an update. Follow the AWP guide for its D1/R2 prerequisites.
4. Deploy the private mailer separately when its code or configuration changes. A Pages deployment does not update that Worker. See [`workers/auth-email/README.md`](workers/auth-email/README.md).
5. Check the PR deployment, authentication, save/reload behaviour and affected exports before merging; confirm the production deployment after merge. Verify shared-data changes using separate signed-in sessions in a non-production environment.

### Database migrations

| Migration | Purpose |
| --- | --- |
| [`0001_entity_records.sql`](migrations/0001_entity_records.sql) | Shared entity-record table and indexes. |
| [`0002_custom_auth.sql`](migrations/0002_custom_auth.sql) | Custom-login challenge/session infrastructure. |
| [`0003_auth_member_identity.sql`](migrations/0003_auth_member_identity.sql) | Per-member identity/presence fields and retirement of unidentified legacy authentication records. |
| [`0004_wsh2.sql`](migrations/0004_wsh2.sql) | AWP upload metadata and shared wash checklist tables. |
| [`0005_wsh2_wash_details.sql`](migrations/0005_wsh2_wash_details.sql) | Manual wash-details field for the current AWP checklist. |

Inspect the migration and record what has already been applied. An existing environment normally needs only its pending migrations; rerunning an `ALTER TABLE` script blindly is not a migration strategy. The authentication identity migration intentionally invalidates specified legacy records, so review its effect before applying it to an established environment.

A successful `/api/health` check confirms the entity-record schema handled by that endpoint. It does not prove that all authentication/AWP migrations, R2 or private-mailer bindings are ready.

### Release checks

1. Keep the change on a focused feature branch and review the diff for unrelated edits or private data.
2. Run the applicable tests, lint/build and feature-specific checks.
3. Inspect the application preview and its deployment checks before approving the PR.
4. Preserve the required author/co-author attribution in both the branch commit and final squash commit, following [AGENTS.md](AGENTS.md).
5. Merge only the reviewed head commit, then verify the deployment for the resulting `main` commit rather than assuming the preview is production.
6. Refresh existing app tabs after a release. Resolve pending saves before clearing browser storage or discarding local recovery data.

The separate `l3-dc-otp-info` Pages project serves public OAuth information only. Its root and build settings differ from the protected app; see the [OAuth information-site guide](docs/oauth-info-site.md).

## Security and access

- Keep staff email allowlists, access codes, session tokens, OAuth credentials and real operational test data out of Git, examples, logs and PR descriptions. Store private configuration in encrypted Cloudflare secrets.
- Approved-email login checks exact configured addresses. Do not replace an allowlist with an entire email domain or send real login PINs merely to test an allowlist change.
- Protected APIs require a verified session; unsafe requests also require the expected same origin.
- Protected-page unlocks are an additional UI guard, not a substitute for server-side authentication or an independently enforced read-only/edit role model.
- Keep R2 workbooks private. Download needed originals before confirmed deletion: deleting an AWP upload also removes its currently sourced checklist rows for other computers. Re-uploading does not recover deleted completion details.

### What a UI lock or status does not prove

The client can display role labels, page locks, online presence, warning colours and form completion states. Those are not interchangeable with server-enforced permissions, physical attendance, actual train fitness or completed field checks. Keep authentication enforced on the API, verify business rules at the correct layer, and never rely on a hidden menu alone to protect sensitive actions.

The public repository should not contain approved staff lists, login values, private Cloudflare binding IDs, original operational workbooks or screenshots exposing private information. Keep local deployment configuration and recovery files out of Git, using the existing ignore rules.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Vite opens but the app cannot sign in/load data | A frontend server does not provide `/api/auth/*`, D1 or R2. Use the documented isolated preview or configure the full backend; do not add a production auth bypass. |
| A page is missing on another laptop | Confirm the same app URL/environment and normal sign-in. Protected-page UI unlocks are local to the relevant browser/tab; a hidden page does not necessarily mean its shared records are missing. |
| Data differs across computers | Check the active depot, PG1/PG2, timetable/preset and date first, then the deployment/database bindings and save feedback. Do not recreate the database or clear local pending input as a first response. |
| A TID remains ordinary text | Confirm that the complete three-digit value exists in the active timetable. Unknown numbers are manual remarks, not automatically accepted timetable services. |
| INS says Saving/Failed | Keep the input, check connectivity/session status and use the available retry. Sync from Main can clear insertion data and is not a save-retry shortcut. |
| FLDC fields are blank in Excel | Check that the train has an eligible PST record and a saved selection for the current Riyadh date/depot with a verifier name. Yesterday's check or a newly added unselected train must not be treated as verified. |
| An AWP batch is rejected | Review the chosen file/date, requested train list and current row revisions. A failed batch should not be reported as partly completed; refresh and retry the intended selection. |
| AWP storage error | Check both `DB` and `WSH2_FILES` plus pending AWP migrations. A frontend deployment alone does not create the database tables or bucket binding. |
| AWP Word download is disabled | Select one/two source files with current rows and stay within the two-table, 19-trains-per-table capacity. A superseded upload with zero current rows is not printable. |
| Next Day Excel rejects a source | Check filename/depot detection, the expected worksheets and the supplied template. Preserve the original workbook; do not delete formulas/notes merely to bypass validation. |
| A warning colour differs in light mode | The added failure/APU card surface is intentionally dark-mode scoped. Also check whether the remark is active/visible and whether a higher-priority search/duplicate state applies in that workspace. |
| Browser buttons remain after Home Screen installation | Launch the installed web app, not a normal bookmark. Re-add an old shortcut if needed, remain within the app origin, and verify on the actual iPhone. The iOS home indicator is OS-controlled. |

When reporting a problem, include the workspace, depot, timetable/page selection, approximate time, exact visible error and whether the same issue occurs after a normal refresh. Redact email addresses, PINs, tokens, private filenames and operational details before sharing diagnostics publicly.

## Repository guide

```text
src/                 React workspaces, components, shared UI logic and styles
functions/           Pages middleware and authenticated API handlers
shared/              Logic shared between browser and API code
migrations/          D1 schema migrations
build/               Vite compatibility transforms
public/              Login assets, app icons, manifest and ATS diagram
workers/auth-email/  Private login-email Worker
oauth-info-site/     Separate public OAuth information site
scripts/             Local preview and verification tools
tests/               Automated regression tests
docs/                Feature, authentication and deployment guides
```

### Documentation index

| Guide | Details |
| --- | --- |
| [Custom email-PIN authentication](docs/custom-pin-auth.md) | Private allowlists, mailer/Turnstile setup, sessions, deployment verification and safe cutover/rollback. |
| [Cloudflare Access](docs/cloudflare-access.md) | Retained Access configuration, exact allowlist checks and fail-closed middleware setup. |
| [Private email Worker](workers/auth-email/README.md) | Separate mailer deployment, service binding and secret responsibilities. |
| [AWP wash checklist](docs/wsh2.md) | Import/print rules, cross-computer storage, migrations, local D1/R2 verification and deletion behaviour. |
| [iPhone Home Screen app](docs/iphone-web-app.md) | Standalone installation metadata, safe areas and physical-device verification. |
| [ATS track explorer](docs/ats-track-explorer.md) | Schematic assets, linked panel layouts, local notes and explicit no-live-control limitations. |
| [Public OAuth information site](docs/oauth-info-site.md) | Separate Pages project and public home/privacy/terms pages. |

For contributions, preserve unrelated work and use a focused feature branch and PR. Check desktop and mobile behaviour for UI changes. Follow [`AGENTS.md`](AGENTS.md) for the required attribution on both branch commits and the final squash-merge commit. Third-party notices are in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

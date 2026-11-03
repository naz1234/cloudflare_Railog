# AWP wash checklist

AWP is the display name of the wash checklist previously labelled WSH2. Its route remains `/#/wsh2` for existing bookmarks, with the same internal API, D1 tables and R2 binding. It occupies the normal washing shortcut position between INS and PSS. The original WSH workspace remains at `/#/train-washing`, in the protected group after ODO.

AWP does not require the extra protected-page unlock. It is available in desktop and mobile navigation after the normal authorized application login; its API and source downloads still require that login. The original WSH page now uses the shared protected-page unlock popup and browser-tab session. Its controls and reports do not mount until unlocked, and desktop/mobile menus hide WSH while locked. Relocking protected pages returns an active WSH view to Train Request, but leaves AWP accessible. This changes the existing UI lock, not server-side login or data permissions.

On desktop, the wash checklist is in the left panel and Uploaded Excel files is in the right panel. Below the 1,100-pixel breakpoint, the panels stack with files first, keeping the existing phone order. Wide wash tables scroll inside their own panel rather than stretching the page. File download, confirmed deletion, completion, upload and print behavior are unchanged.

Desktop checklist rows use compact padding and 24-pixel controls without reducing text size. Phones retain 42-pixel touch controls.

The AWP title, three compact Design C pills (completed washes, percentage progress and remaining washes) and Upload / Print / Refresh actions share one header card. Totals follow the current shared rows, including zero uploads and fully completed schedules. On narrower screens, the pills and actions wrap inside that same card instead of creating a separate completion strip.

## Shared storage

- `DB` (D1) stores each train/date wash entry, completion state, HVAC, manually typed wash details, revision and the user/time of the latest update. Older Partial/Full and depot fields are retained for compatibility.
- `WSH2_FILES` (private R2 bucket) retains original uploaded workbooks. Downloads require the same app login as the checklist.
- All computers use the same two bindings. The page refreshes every five seconds while visible, and on focus or reconnection. No checklist state is held exclusively in browser storage.
- Edits are revision-checked. A stale client receives HTTP 409 and the current row, rather than overwriting another computer's changes.
- Email, Cloudflare Access and code-only sign-ins use the existing verified middleware session. Code-only sessions have no email, so their upload/edit audit fields use the member identity hash, never the session token or token hash. Anonymous and expired sessions remain blocked.
- Repeated files are identified by SHA-256. Re-importing a changed report updates source scheduling details by train/date without resetting completion, location, HVAC or manual wash details. Conflicting times for one train/date inside a workbook are rejected.
- Dates remain depot wall-clock values, independent of the laptop timezone. Both 1900 and 1904 Excel date systems are supported.

## Before production deployment

Do not change production during local review.

1. Apply `migrations/0004_wsh2.sql` and then `migrations/0005_wsh2_wash_details.sql` to the existing D1 database. For an existing AWP database, only the new 0005 migration is needed. It adds `wash_details` without clearing older records. Apply it before deploying the updated API, including in preview environments being tested.
2. Create a private R2 bucket and bind it as `WSH2_FILES` on the Pages project (and each preview environment that should support WSH2). Do not enable a public bucket URL. Reuse the same bucket and D1 database for all users of that environment.
3. Deploy the application and Functions together using the normal PR workflow.
4. Verify upload, reload, download and cross-computer edits with two signed-in users. Existing authentication and same-origin mutation protections remain required.

If a binding or the migration is missing, WSH2 shows a storage error and does not report a successful save.

## Local preview and storage verification

Install Miniflare 4 in a local tooling directory (or as a development dependency). If outside this repository, set `WSH2_MINIFLARE_ENTRY` to its entry-point file URL. Run:

```text
node scripts/preview-wsh2.mjs
node scripts/verify-wsh2-storage.mjs
```

Open `http://127.0.0.1:4199/wsh2-preview`. The preview uses the actual API handler in Cloudflare's local runtime, with persistent local D1/R2 under the gitignored `.wrangler/wsh2-local` folder. Its local-only wrapper supplies a test identity. This is not an authentication bypass in production, and it is never built into the deployed Functions. The server binds to loopback only and cannot reach production resources.

The standalone verification script uses fresh temporary D1/R2 resources and disposes them afterwards. Unit tests run with the normal `node --test tests/*.test.js` command.

## Workbook and print behavior

Upload one or more `.xlsx` reports with `Train Number` and `Next Wash` headers. Optional `Train Location` and `Last Wash` columns are retained. Original location is the starting value of the editable Location column. File limit: 5 MB compressed, 32 MB expanded, 500 entries. Invalid rows reject the entire individual workbook with its sheet/row location; successfully uploaded other files remain imported.

The uploaded-file list is always visible beside the checklist on desktop and above it on smaller screens. All uploaded dates and both depots are shown together, without date-range, status or depot filters. Dates are read from the Excel files. Ticking Done saves completion and HVAC ON atomically. It does not fill in wash details. Unticking Done does not clear separately recorded HVAC or wash details, and older completed rows are not retroactively altered.

Location is an OPE/MAINT dropdown. Source locations outside those choices are retained as a disabled placeholder until the user explicitly chooses one; existing data is not silently reclassified. HVAC automatically records ON when Done is ticked and can still be edited independently afterward. Unchecking HVAC clears it to blank, not OFF. New OFF updates are rejected. Legacy OFF data is treated as unconfirmed in the UI and prints blank; ON rows print ON. This records checklist information, not a command to train hardware. The storage/timestamp badge is hidden, but polling and error reporting stay active.

The `PARTIAL / FULL — WD or ED` column is one empty text box for manual typing, not two dropdowns. New rows have no default text. Enter up to 120 characters, for example `Partial / WD` or `Full / ED`; press Enter or click outside to save. The revision captured when editing started protects against conflicting changes from another computer. Existing saved dropdown choices display as their combined text, such as `Partial / ED`, until edited; clearing the text explicitly clears that older combination too. Manual details are preserved on reupload and printed verbatim with XML escaping in Word exports.

### Batch completed-wash entry

Below Uploaded Excel files, select one uploaded file/date, enter train numbers such as `01 02 03 04 05`, then select Submit completed wash. One-digit numbers are normalized, repeated numbers count once, and spaces, line breaks, commas or semicolons are accepted. Numbers must be 01–47. Files covering multiple dates have a separate option for each date; superseded uploads with no current rows are not selectable.

Every requested train must exist in that file/date before anything is submitted. The shared API then checks all row revisions and source ownership together in one atomic SQL update: either every selected train is marked Done with HVAC ON, or none are changed. A conflict asks the user to review refreshed entries before retrying. This preserves locations, manual wash details and the original completion timestamp of already-completed rows. Only the selected file/date is affected. Polling distributes the saved updates to other computers; no extra migration is required for batch entry beyond the manual-details migration above.

Each uploaded file has an original-download link and a two-step Delete / Confirm? action with Cancel. The confirmation expires after 15 seconds. Confirming permanently removes the original workbook from R2 and the rows currently sourced from that upload (including their completion details) from D1 for every computer. Rows subsequently supplied by another upload are kept; deleting a newer upload does not restore superseded older versions. Imported and current row counts make this distinction visible. Download the original first if needed; re-uploading a deleted file recreates its rows without deleted completion details.

Deletion requires a verified session, same-origin request, upload ID and explicit confirmation. The server resolves the R2 key from D1. R2 is deleted first, then rows and upload metadata are deleted in one D1 batch. An R2 failure leaves D1 untouched; if D1 fails after R2 succeeds, the upload stays listed for a safe retry (its original may temporarily be unavailable). Already-deleted uploads are safe to retry. No new migration is needed for deletion.

Print / Word opens a file picker before downloading. Choose one or two uploaded Excel files; a third selection is disabled until another is deselected. Only current checklist rows belonging to the selected source uploads are exported, including saved ticks and wash details from both depots. A replaced upload with no current rows is disabled. Polling updates are reflected in the picker, and the selection is validated again at download time.

The genuine A4 `.docx` keeps the paper's yellow date labels, seven columns and blank writing rows. The page supports up to two tables of 19 trains. If a selected schedule would need more tables, download is blocked with a clear message; rows are never silently dropped or pushed onto an additional page. The optional DC MARK name input and printed name/signature line remain removed. This selection does not delete uploads or change shared checklist data.

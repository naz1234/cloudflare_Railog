# AWP wash checklist

AWP is the display name of the wash checklist previously labelled WSH2. Its route remains `/#/wsh2` for existing bookmarks, with the same internal API, D1 tables and R2 binding. It occupies the normal washing shortcut position between INS and PSS. The original WSH workspace remains at `/#/train-washing`, in the protected group after ODO.

AWP does not require the extra protected-page unlock. It is available in desktop and mobile navigation after the normal authorized application login; its API and source downloads still require that login. The original WSH page now uses the shared protected-page unlock popup and browser-tab session. Its controls and reports do not mount until unlocked, and desktop/mobile menus hide WSH while locked. Relocking protected pages returns an active WSH view to Train Request, but leaves AWP accessible. This changes the existing UI lock, not server-side login or data permissions.

## Shared storage

- `DB` (D1) stores each train/date wash entry, completion state, HVAC, Partial/Full, depot, revision and the user/time of the latest update.
- `WSH2_FILES` (private R2 bucket) retains original uploaded workbooks. Downloads require the same app login as the checklist.
- All computers use the same two bindings. The page refreshes every five seconds while visible, and on focus or reconnection. No checklist state is held exclusively in browser storage.
- Edits are revision-checked. A stale client receives HTTP 409 and the current row, rather than overwriting another computer's changes.
- Email, Cloudflare Access and code-only sign-ins use the existing verified middleware session. Code-only sessions have no email, so their upload/edit audit fields use the member identity hash, never the session token or token hash. Anonymous and expired sessions remain blocked.
- Repeated files are identified by SHA-256. Re-importing a changed report updates source scheduling details by train/date without resetting completion, location, HVAC, wash type or depot. Conflicting times for one train/date inside a workbook are rejected.
- Dates remain depot wall-clock values, independent of the laptop timezone. Both 1900 and 1904 Excel date systems are supported.

## Before production deployment

Do not change production during local review.

1. Apply `migrations/0004_wsh2.sql` to the existing D1 database.
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

The uploaded-file list is always visible above the checklist. All uploaded dates and both depots are shown together, without date-range, status or depot filters. Dates are read from the Excel files. Ticking a train only changes completion: depot, HVAC and Partial/Full are not inferred. Each row's depot can still be recorded directly to indicate where its wash was done.

Location is an OPE/MAINT dropdown. Source locations outside those choices are retained as a disabled placeholder until the user explicitly chooses one; existing data is not silently reclassified. HVAC is a separate checkbox confirming ON after washing, never automatically set by completing a wash. Checking saves `ON`; unchecking clears the confirmation to blank, not OFF. New OFF updates are rejected. Legacy OFF data is treated as unconfirmed in the UI and prints blank; confirmed rows print ON. The storage/timestamp badge is hidden, but polling and error reporting stay active.

Each uploaded file has an original-download link and a two-step Delete / Confirm? action with Cancel. The confirmation expires after 15 seconds. Confirming permanently removes the original workbook from R2 and the rows currently sourced from that upload (including their completion details) from D1 for every computer. Rows subsequently supplied by another upload are kept; deleting a newer upload does not restore superseded older versions. Imported and current row counts make this distinction visible. Download the original first if needed; re-uploading a deleted file recreates its rows without deleted completion details.

Deletion requires a verified session, same-origin request, upload ID and explicit confirmation. The server resolves the R2 key from D1. R2 is deleted first, then rows and upload metadata are deleted in one D1 batch. An R2 failure leaves D1 untouched; if D1 fails after R2 succeeds, the upload stays listed for a safe retry (its original may temporarily be unavailable). Already-deleted uploads are safe to retry. No new migration is needed for deletion.

Print / Word downloads a genuine A4 `.docx`, with two date sections per page, yellow date labels, the paper's seven columns, blank writing rows and DC MARK. It includes all current rows from both depots and their saved completion values. For dates with more than 19 trains, continuation sections include every train. The optional DC MARK input is print-only, not a shared checklist field.

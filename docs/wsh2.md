# WSH2 wash checklist

The existing WSH page is unchanged. The new authenticated route is `/#/wsh2`.

WSH2 is grouped with the existing protected pages, after ODO. It uses their shared unlock popup and browser-tab session. Direct navigation shows a lock screen, and the checklist is not mounted or polled until unlocked. The mobile menu hides WSH2 while locked. Relocking protected pages returns an active WSH2 view to Train Request. This is the same UI lock as the other protected pages; server-side data access still requires the application's authorized login, not a separate WSH2 role.

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

The working-depot selector supplies West/East when a previously unassigned train is ticked complete. HVAC and Partial/Full are intentionally not inferred from the completion tick. Every row's depot can also be selected directly.

Print / Word downloads a genuine A4 `.docx`, with two date sections per page, yellow date labels, the paper's seven columns, blank writing rows and DC MARK. It includes the currently filtered rows and their saved completion values. For dates with more than 19 trains, continuation sections include every train. The optional DC MARK input is print-only, not a shared checklist field.

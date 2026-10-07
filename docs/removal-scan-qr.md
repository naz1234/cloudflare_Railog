# QR phone upload without staff login

The signed-in computer creates a QR session for the selected Removal summary timetable and period. The phone opens the standalone `/removal-scan#id=…&token=…` page, takes a photo or selects an image, reviews the extracted Vehicle/Tracking IDs and confirms the complete table. The computer must keep its QR window open to apply and save the update through its existing authenticated operational API. Missing image TIDs clear train assignments only in the selected period; timetable TIDs, times, other periods and Undo remain unchanged.

## Access boundary

- Only GET/HEAD for `/removal-scan`, `/removal-scan.html`, `/removal-scan-assets/removal-scan.js` and `/removal-scan-assets/removal-scan.css` are public static requests. No wildcard asset or application-root exemption is used. The standalone build imports no login provider, staff presence or dashboard client.
- QR links carry a cryptographically random 256-bit token in the URL fragment, never in server query strings. D1 stores only its SHA-256 hash. Do not share or publish a live QR/link, include it in logs, or send it to analytics.
- A phone supplies the token in `X-Removal-Scan-Token` for one session ID. The handler checks its hash, 15-minute expiry and workflow state before returning any session data or calling Azure OCR. An unrelated staff login does not override the token boundary.
- Anonymous phones may read that session, upload at most four images (4 MB each, with a bounded 5 MB multipart body) and confirm a reviewed result. They cannot create/cancel a session, apply/save operational data, read other sessions or access other Railog APIs. Unsafe requests still require exact same-origin headers.
- Closing the computer QR revokes phone access. Applying the update consumes its write/read-data capability: the phone can only fetch a minimal completion receipt, with no target rows or extraction, until expiry. Re-upload and replayed confirmation are rejected. A new update requires a newly generated QR.
- Scanner responses are uncacheable, non-indexable, deny framing and use a same-origin CSP with no inline/eval scripts or third-party resources. Uploaded images are processed by the existing Azure Document Intelligence service and are not stored by Railog.

`npm run build` builds the protected dashboard first and then the standalone scanner into its exact allowed asset paths. Both must be deployed together.

If a Cloudflare Access application independently guards the hostname at the edge, these application-level exceptions cannot override it. Add only the same scanner paths and token-validated scanner endpoint to a narrowly scoped edge exception; never bypass the whole hostname. The application's API token validation remains mandatory even with an edge exception. Existing staff authentication is unchanged.

## Verification

Run `npm test`, `npm run lint` and `npm run build`. Tests exercise the anonymous-phone workflow through the real middleware, incorrect/missing/expired tokens, cross-session access, origin checks, upload limits, cancelled/consumed scans and continued protection of other operational APIs/assets. In a fresh phone/private browser, verify a new QR opens directly to Take photo / Choose from gallery. An expired or closed QR must refuse uploads. Keep real production assignments untouched during smoke tests.

For local UI QA after building, run `node scripts/preview-removal-scan-public.mjs` and open `http://127.0.0.1:4194/qr-test`. This fixture server deliberately refuses staff login, serves the exact production scanner bundle behind the real middleware, and substitutes in-memory D1 and example OCR results. It never calls production APIs or Azure.

# Custom approved-staff email-PIN authentication

The custom login is designed for individually identified L3 DC staff. Each user enters their own Flow Metro email address, completes Cloudflare Turnstile, and receives a six-digit code only when the normalized address exactly matches the private approved-staff allowlist. After verification, the session carries that approved identity so the application can show the user's derived display name and an approximate online-presence indicator.

The allowlist belongs only in the encrypted `AUTH_ALLOWED_EMAILS` secrets on Pages and the private mailer Worker. Do not commit real staff addresses to source, documentation, examples, fixtures, logs, or a pull-request description.

> **Keep Cloudflare Access enabled during setup and testing.** This repository defaults to `AUTH_MODE=cloudflare_access`. Do not switch production to `custom_pin` or disable the Access application until the mailer, Turnstile, D1 migration, secrets, and the full verification checklist below are complete.

## Security model

- Only the canonical `/login` route (plus the backward-compatible `/login.html` alias), its exact login assets, the favicon, and the required `/api/auth/*` methods are public in custom mode. The Railog HTML, application bundle, images, and operational APIs remain behind server middleware.
- Turnstile is validated server-side before any email is sent. The expected hostname and action are checked.
- The submitted address is normalized and matched case-insensitively against `AUTH_ALLOWED_EMAILS`. The mailer independently enforces the same encrypted allowlist and never delivers a code to an arbitrary browser-supplied recipient.
- Each approved request creates an independent opaque challenge ID and short request reference bound to an HMAC-derived identity key. Parallel staff requests do not invalidate each other.
- The PIN is generated with `crypto.getRandomValues`, stored only as an HMAC, expires after five minutes, and allows at most five attempts.
- The session token is 256-bit random data. D1 stores only its HMAC plus the HMAC-derived approved identity, expiry, revocation state, and coarse last-seen time. Display names are re-derived from the encrypted allowlist rather than stored in the authentication tables. The `__Host-l3dc_session` cookie is `Secure`, `HttpOnly`, `SameSite=Strict`, has `Path=/`, and expires after eight hours.
- Every protected request revalidates the session in D1. Authenticated presence heartbeats update the coarse last-seen time; the online list contains approved display names only and treats a user as offline after two minutes without a heartbeat. It is an approximate application-presence signal, not a physical attendance record.
- Logout revokes the session server-side. Unsafe requests require an exact same-origin `Origin` header.
- Request limits combine Turnstile, source-IP limits, per-identity limits, and a global Gmail provider guard. No raw PIN, session token, IP address, or full staff email address is written to the auth tables or application logs.

Email possession identifies the approved staff mailbox that completed the challenge, but it does not prove who was physically operating that mailbox. A determined human or distributed attacker can still cause nuisance emails, so add a Cloudflare WAF rate rule or a stable OCC source-network rule if one is available.

## 1. Prepare the dedicated Gmail sender

Use a dedicated Gmail account only for L3 DC login codes. Protect it with 2-Step Verification; do not use a personal mailbox and never store its Google password in Cloudflare.

1. Create a Google Cloud project owned by the dedicated Gmail account and enable **Gmail API**.
2. Configure an External OAuth consent screen and add only the `https://www.googleapis.com/auth/gmail.send` scope.
3. Add the dedicated Gmail account as a test user while setup is in progress.
4. Create a **Web application** OAuth client with `https://developers.google.com/oauthplayground` as its only redirect URI. Leave JavaScript origins empty.
5. In OAuth Playground, use the project's own client ID and client secret, select server-side/offline access, authorize only `gmail.send`, and exchange the one-time authorization code for a refresh token.
6. Deploy the private worker in [`workers/auth-email`](../workers/auth-email) with `workers_dev = false` and no route or custom domain.
7. Add these encrypted Worker secrets:
   - `AUTH_GMAIL_CLIENT_ID`
   - `AUTH_GMAIL_CLIENT_SECRET`
   - `AUTH_GMAIL_REFRESH_TOKEN`
   - `AUTH_EMAIL_FROM` = the dedicated Gmail address
   - `AUTH_ALLOWED_EMAILS` = the private approved-staff allowlist, one address per line
   - `AUTH_EMAIL_SERVICE_TOKEN` = a separate random service secret of at least 32 characters
8. Set the same `AUTH_ALLOWED_EMAILS` and `AUTH_EMAIL_SERVICE_TOKEN` values as encrypted Pages secrets, then bind the Worker to Pages as `AUTH_EMAIL_SERVICE`.

The browser sends the entered work address to Pages. Pages validates it and asks the private mailer to deliver the code to that same normalized address. The mailer authenticates the Pages request, independently checks its encrypted allowlist, rejects unapproved or malformed recipients and unexpected fields, keeps all OAuth credentials inside the private Worker, exchanges the refresh token only at Google's token endpoint, and sends only through Gmail's `users.messages.send` API.

> **Do not cut over while the Google OAuth app remains External/Testing.** Google documents that refresh tokens for External apps in Testing expire after seven days when non-basic scopes such as `gmail.send` are requested. For this single dedicated sender, open **Google Auth Platform > Audience**, publish the app to **In production**, then authorize it once more and replace the Testing refresh token with the newly issued token. Google allows personal-use apps with fewer than 100 known users to remain unverified, although the dedicated sender sees an unverified-app warning during that one-time authorization. OCC users never authorize the Google app; they only receive the L3 DC login code.

The production OAuth Branding links are served by the separate public site documented in [`oauth-info-site.md`](oauth-info-site.md). Do not reuse the protected Railog hostname for these pages because Google must be able to load them without authentication.

## 2. Create Turnstile widgets

Create separate Preview and Production Turnstile widgets. Restrict each widget to the hostnames that use it. Store:

- `TURNSTILE_SITE_KEY` as a Pages variable.
- `TURNSTILE_SECRET_KEY` as an encrypted Pages secret.

The login uses the fixed Turnstile action `l3dc-login`. Server verification must pass before the request enters the email cadence limiter.

## 3. Apply the D1 migration

Use separate Preview and Production D1 databases. Bind each one to the Pages project as `DB`, then apply all migrations in order. [`migrations/0002_custom_auth.sql`](../migrations/0002_custom_auth.sql) creates the authentication tables, and [`migrations/0003_auth_member_identity.sql`](../migrations/0003_auth_member_identity.sql) adds the HMAC-derived identity and presence fields required by per-user login.

Example, after replacing the database name:

```powershell
npx wrangler d1 migrations apply YOUR_PREVIEW_DB --remote
npx wrangler d1 migrations apply YOUR_PRODUCTION_DB --remote
```

The per-user migration invalidates challenges and sessions created by the former shared-recipient design because those rows do not identify an individual staff member. The runtime does not create or alter auth tables automatically. Missing migrations cause authentication to fail closed.

## 4. Configure Pages

Keep the existing Cloudflare Access variables and secret while testing. Add these bindings and settings separately for Preview and Production:

| Name | Type | Purpose |
| --- | --- | --- |
| `DB` | D1 binding | Challenges, limits, identity-bound sessions, and coarse presence |
| `AUTH_EMAIL_SERVICE` | Service binding | Private `l3-dc-auth-email` worker |
| `AUTH_MODE` | Variable | Keep `cloudflare_access` until cutover |
| `AUTH_ALLOWED_EMAILS` | Encrypted secret | Private approved-staff allowlist, one address per line |
| `AUTH_HMAC_SECRET` | Encrypted secret | Random secret of at least 32 characters |
| `AUTH_EMAIL_SERVICE_TOKEN` | Encrypted secret | Authenticates Pages to the mailer worker |
| `TURNSTILE_SITE_KEY` | Variable | Public widget key for this environment |
| `TURNSTILE_SECRET_KEY` | Encrypted secret | Server-side widget secret |

Configure the same approved addresses in the mailer Worker's encrypted `AUTH_ALLOWED_EMAILS` secret. The Worker requires an explicit allowlisted recipient on every request and does not support a shared-recipient fallback.

After changing bindings, variables, or secrets, redeploy Pages so Functions receive them. Apply every pending D1 migration in order before deploying code that reads identity or presence columns. Missing tables or columns cause authentication to fail closed.

## 5. Test while Access still protects the site

First test Preview. Keep the Cloudflare Access application at the edge and set Preview `AUTH_MODE=custom_pin`; this intentionally creates two gates during the test.

Verify all of these in a fresh private browser:

1. The Access One-time PIN rollback gate still opens for an approved individual address.
2. The custom page says **WEST DEPOT**, instructs the user to enter their approved Flow Metro email address, and does not expose the private allowlist.
3. Address matching is case-insensitive, but the session uses the canonical approved identity and derives the expected display name from it.
4. Turnstile completes and an approved user receives one email at their own address with a six-digit code and matching request reference.
5. A syntactically valid but unapproved address receives no code and the public response does not disclose allowlist membership.
6. A valid code opens Railog as the identity bound to that challenge; another user's code or an invalid code does not.
7. A code expires after five minutes and cannot be used twice.
8. Two separate users can request and verify independent challenges without replacing each other.
9. Per-IP, per-identity, resend, and global provider limits work without leaking raw addresses to logs.
10. The authenticated session returns the expected approved display name. The online list shows recently active approved display names only, deduplicates multiple sessions, and removes users after logout, expiry, or the inactivity window.
11. Logout revokes the session in every open tab.
12. A direct document request without the session redirects once to `/login`.
13. Direct API, JavaScript, CSS, and image requests without the session return `401`, not application or login content.
14. Cross-origin `POST`, `PUT`, `PATCH`, and `DELETE` requests return `403`.
15. Email-delivery, allowlist drift, Turnstile, D1, and missing-secret failures stay closed without exposing secret values.

Repeat the same checks in Production while Cloudflare Access is still enabled.

## 6. Cut over and roll back safely

Only after the checklist passes:

1. Confirm Production is deployed with `AUTH_MODE=custom_pin` while Access is still enabled.
2. Confirm the encrypted Pages and mailer `AUTH_ALLOWED_EMAILS` secrets contain the same approved addresses and that the retained Access rollback list matches them.
3. Disable or bypass the Access enforcement policy; do not delete the application or its approved-staff list.
4. Test the production URL from a new private browser and confirm the custom per-user page is now the first screen.
5. Confirm obsolete shared-recipient settings have been removed from both Pages and the mailer Worker.
6. Keep a verified per-user Pages deployment and the Access configuration available. Builds from the former shared-recipient flow are not valid rollback targets because the mailer rejects their two-field requests.

If email, Turnstile, D1, or session verification fails, re-enable Cloudflare Access first. Then set `AUTH_MODE=cloudflare_access` and redeploy. Never leave the site without one verified server-side gate.

Official Cloudflare references:

- [Pages Service bindings](https://developers.cloudflare.com/pages/functions/bindings/#service-bindings)
- [Turnstile server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Turnstile content security policy](https://developers.cloudflare.com/turnstile/reference/content-security-policy/)
- [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)

Official Google references:

- [Gmail API message sending](https://developers.google.com/workspace/gmail/api/guides/sending)
- [Server-side Gmail OAuth](https://developers.google.com/workspace/gmail/api/auth/web-server)
- [OAuth Playground](https://developers.google.com/oauthplayground/)
- [OAuth refresh-token lifetime](https://developers.google.com/identity/protocols/oauth2#expiration)
- [When OAuth verification is not required](https://support.google.com/cloud/answer/13464323)

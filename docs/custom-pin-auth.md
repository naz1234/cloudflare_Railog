# Custom email-PIN authentication

The custom login is designed for one private L3 DC shared mailbox. The browser never accepts or chooses an email address: it displays only a masked hint, completes Cloudflare Turnstile, and requests a six-digit code for the server-configured mailbox.

> **Keep Cloudflare Access enabled during setup and testing.** This repository defaults to `AUTH_MODE=cloudflare_access`. Do not switch production to `custom_pin` or disable the Access application until the mailer, Turnstile, D1 migration, secrets, and the full verification checklist below are complete.

## Security model

- Only `/login.html`, its exact login assets, the favicon, and the required `/api/auth/*` methods are public in custom mode. The Railog HTML, application bundle, images, and operational APIs remain behind server middleware.
- Turnstile is validated server-side before any email is sent. The expected hostname and action are checked.
- Each request creates an independent opaque challenge ID and short request reference. Parallel staff requests do not invalidate each other.
- The PIN is generated with `crypto.getRandomValues`, stored only as an HMAC, expires after five minutes, and allows at most five attempts.
- The session token is 256-bit random data. D1 stores only its HMAC. The `__Host-l3dc_session` cookie is `Secure`, `HttpOnly`, `SameSite=Strict`, has `Path=/`, and expires after eight hours.
- Every protected request revalidates the session in D1. Logout revokes it server-side. Unsafe requests require an exact same-origin `Origin` header.
- Request limits combine Turnstile, one email request per source IP per minute, five requests per source IP per 15 minutes, and a three-email-per-minute global provider guard. No raw PIN, session token, IP address, or mailbox is written to the auth tables or logs.

The shared mailbox is a shared identity. It does not prove which individual staff member used a code. A determined human or distributed attacker can still cause nuisance emails, so add a Cloudflare WAF rate rule or a stable OCC source-network rule if one is available.

## 1. Prepare Email Service

Cloudflare Email Service requires a sender domain that is already in this Cloudflare account, uses Cloudflare DNS, and has been onboarded for Email Sending. A `pages.dev` hostname cannot be the sender.

1. Open **Cloudflare > Compute > Email Service > Email Sending**.
2. Onboard a domain that you control and wait for its sending DNS records to become active.
3. Verify the private L3 DC mailbox as a destination address.
4. Deploy the private worker in [`workers/auth-email`](../workers/auth-email).
5. Add its `EMAIL` send binding with both restrictions:
   - `destination_address` = the private L3 DC mailbox
   - `allowed_sender_addresses` = the onboarded no-reply sender
6. Keep `workers_dev = false`; the worker should be reachable only through a Pages Service binding.
7. Set the same strong `AUTH_EMAIL_SERVICE_TOKEN` secret on the worker and Pages project.

The mailer deliberately ignores browser-supplied sender or recipient values. The binding restriction is a second independent safeguard.

## 2. Create Turnstile widgets

Create separate Preview and Production Turnstile widgets. Restrict each widget to the hostnames that use it. Store:

- `TURNSTILE_SITE_KEY` as a Pages variable.
- `TURNSTILE_SECRET_KEY` as an encrypted Pages secret.

The login uses the fixed Turnstile action `l3dc-login`. Server verification must pass before the request enters the email cadence limiter.

## 3. Apply the D1 migration

Use separate Preview and Production D1 databases. Bind each one to the Pages project as `DB`, then apply [`migrations/0002_custom_auth.sql`](../migrations/0002_custom_auth.sql) before enabling custom mode.

Example, after replacing the database name:

```powershell
npx wrangler d1 migrations apply YOUR_PREVIEW_DB --remote
npx wrangler d1 migrations apply YOUR_PRODUCTION_DB --remote
```

The runtime does not create auth tables automatically. Missing tables cause authentication to fail closed.

## 4. Configure Pages

Keep the existing Cloudflare Access variables and secret while testing. Add these bindings and settings separately for Preview and Production:

| Name | Type | Purpose |
| --- | --- | --- |
| `DB` | D1 binding | Challenges, limits, and sessions |
| `AUTH_EMAIL_SERVICE` | Service binding | Private `l3-dc-auth-email` worker |
| `AUTH_MODE` | Variable | Keep `cloudflare_access` until cutover |
| `AUTH_LOGIN_EMAIL` | Encrypted secret | Exactly one private shared mailbox |
| `AUTH_HMAC_SECRET` | Encrypted secret | Random secret of at least 32 characters |
| `AUTH_EMAIL_SERVICE_TOKEN` | Encrypted secret | Authenticates Pages to the mailer worker |
| `TURNSTILE_SITE_KEY` | Variable | Public widget key for this environment |
| `TURNSTILE_SECRET_KEY` | Encrypted secret | Server-side widget secret |

After changing bindings, variables, or secrets, redeploy Pages so Functions receive them.

## 5. Test while Access still protects the site

First test Preview. Keep the Cloudflare Access application at the edge and set Preview `AUTH_MODE=custom_pin`; this intentionally creates two gates during the test.

Verify all of these in a fresh private browser:

1. The Access One-time PIN gate still opens for the approved mailbox.
2. The custom page says **WEST DEPOT**, contains no email input, and displays only the masked mailbox.
3. Turnstile completes and one email arrives with a six-digit code and matching request reference.
4. A valid code opens Railog; an invalid code does not.
5. A code expires after five minutes and cannot be used twice.
6. Two separate code requests remain independently valid.
7. Resend requires a fresh Turnstile token and respects the displayed cooldown.
8. Logout revokes the session in every open tab.
9. A direct document request without the session redirects to `/login.html`.
10. Direct API, JavaScript, CSS, and image requests without the session return `401`, not application or login content.
11. Cross-origin `POST`, `PUT`, `PATCH`, and `DELETE` requests return `403`.
12. Email-delivery, Turnstile, D1, and missing-secret failures stay closed without exposing secret values.

Repeat the same checks in Production while Cloudflare Access is still enabled.

## 6. Cut over and roll back safely

Only after the checklist passes:

1. Confirm Production is deployed with `AUTH_MODE=custom_pin` while Access is still enabled.
2. Disable the Access application or policy; do not delete it.
3. Test the production URL from a new private browser and confirm the custom page is now the first screen.
4. Keep the previous Pages deployment and Access configuration available.

If email, Turnstile, D1, or session verification fails, re-enable Cloudflare Access first. Then set `AUTH_MODE=cloudflare_access` and redeploy. Never leave the site without one verified server-side gate.

Official Cloudflare references:

- [Email Service setup](https://developers.cloudflare.com/email-service/get-started/send-emails/)
- [Restrict Email Service send bindings](https://developers.cloudflare.com/email-service/configuration/send-bindings/)
- [Pages Service bindings](https://developers.cloudflare.com/pages/functions/bindings/#service-bindings)
- [Turnstile server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Turnstile content security policy](https://developers.cloudflare.com/turnstile/reference/content-security-policy/)
- [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)

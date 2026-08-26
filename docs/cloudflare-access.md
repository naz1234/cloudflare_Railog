# L3 DC approved-staff Cloudflare Access

The application must be protected by Cloudflare Access before it is used with operational data. The Pages middleware also fails closed unless it receives a valid Access JWT and the verified email matches the private approved-staff allowlist.

Cloudflare Access remains the source-code default and emergency rollback authentication mode. Production may override it with the [custom email-PIN design](custom-pin-auth.md), but Access must stay available until that guide's mailer, Turnstile, D1, dual-gate testing, and cutover checklist are complete.

The approved addresses are private data and must not be committed to this public repository. Store the list in Cloudflare Zero Trust and in the encrypted Pages secret described below. Keep it synchronized with the custom PIN `AUTH_ALLOWED_EMAILS` secret so the rollback gate authorizes the same people.

> **Configure the Access application, policy, variables, and secret before merging this PR.** Until every setting exists, the fail-closed middleware returns `503` for the entire site, including static assets and `/api/*` routes.

## 1. Enable One-time PIN

1. Open **Cloudflare Zero Trust > Integrations > Identity providers**.
2. Select **Add new identity provider > One-time PIN**.
3. Open the Railog Access application and select One-time PIN as its only identity provider.
4. If available, enable instant authentication for the single identity provider.

## 2. Upload the approved-staff list

1. Open **Zero Trust > Reusable components > Lists**.
2. Create an `EMAIL` list and upload a private CSV using this format:

   ```csv
   value,description
   member@example.com,Approved L3 DC staff
   ```

3. Confirm the list contains exactly the currently approved individual addresses and no domain-wide or wildcard entry.
4. Do not add this CSV to Git.

## 3. Create the application policy

Use one `Allow` policy with both of these rules:

- **Include:** Emails in list = the private L3 DC approved-staff list
- **Require:** Login Methods = One-time PIN

One-time PIN must be a **Require** rule, not an Include rule. Using it as an Include rule would allow anyone with a valid email address. Remove broad Allow rules such as `Everyone` or an entire email domain, and review Bypass policies because they take precedence over Allow policies.

The Access application must cover the production hostname, every custom domain, and preview deployment hostnames. Disable public previews if they cannot be covered by the same policy.

## 4. Configure Pages variables and the private secret

Set these for both Production and Preview deployments:

| Name | Storage | Value |
| --- | --- | --- |
| `CF_ACCESS_TEAM_DOMAIN` | Variable | `<team-name>.cloudflareaccess.com` |
| `CF_ACCESS_AUD` | Variable | Every Railog Access application audience tag, separated by commas or new lines |
| `OCC_ALLOWED_EMAILS` | Encrypted secret | The private approved-staff list, one address per line |

The middleware returns `503` when any required setting is missing or the private allowlist is invalid. It validates the `Cf-Access-Jwt-Assertion` signature against Cloudflare's rotating JWKS, plus the issuer, audience, expiry, and exact normalized email membership. Never replace the exact list with an entire email domain.

If production, preview, or a custom domain uses a separate Access application, include each corresponding audience tag in the environment for that deployment scope. Production and Preview can have different `CF_ACCESS_AUD` values.

The only unauthenticated middleware exception is `GET` or `HEAD` under `/.well-known/acme-challenge/<token>`, which Cloudflare Pages may need for custom-domain certificate validation. That path must never serve application or API data.

## 5. Verify before operational use

1. An address from the list receives a One-time PIN and can open the app.
2. An address outside the list is denied.
3. Production, previews, custom domains, and `/api/*` routes are all protected.
4. Each approved user is identified by their own verified address; no shared recipient is required.
5. Adding or removing an approved address requires updating both the private Access list and `OCC_ALLOWED_EMAILS`, followed by the required Pages redeployment and verification.

When custom PIN authentication is the production gate, the Access application may have an intentional Bypass policy. Keep the approved-staff list and Allow policy available but disabled by that Bypass so Access can be restored quickly during a rollback.

Official Cloudflare references:

- [One-time PIN](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/)
- [Access policies](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/)
- [Reusable lists](https://developers.cloudflare.com/cloudflare-one/reusable-components/lists/)
- [Validate Access JWTs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)

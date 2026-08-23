# OCC-only Cloudflare Access

The application must be protected by Cloudflare Access before it is used with operational data. The Pages middleware also fails closed unless it receives a valid Access JWT and the verified email is present in the private 38-member allowlist.

The member addresses are personal data and must not be committed to this public repository. Store them in Cloudflare Zero Trust and in the encrypted Pages secret described below.

> **Configure the Access application, policy, variables, and secret before merging this PR.** Until every setting exists, the fail-closed middleware returns `503` for the entire site, including static assets and `/api/*` routes.

## 1. Enable One-time PIN

1. Open **Cloudflare Zero Trust > Integrations > Identity providers**.
2. Select **Add new identity provider > One-time PIN**.
3. Open the Railog Access application and select One-time PIN as its only identity provider.
4. If available, enable instant authentication for the single identity provider.

## 2. Upload the exact 38-member email list

1. Open **Zero Trust > Reusable components > Lists**.
2. Create an `EMAIL` list and upload a private CSV using this format:

   ```csv
   value,description
   member@example.com,OCC member
   ```

3. Confirm the list contains exactly 38 unique email addresses.
4. Do not add this CSV to Git.

## 3. Create the application policy

Use one `Allow` policy with both of these rules:

- **Include:** Emails in list = the 38-member email list
- **Require:** Login Methods = One-time PIN

One-time PIN must be a **Require** rule, not an Include rule. Using it as an Include rule would allow anyone with a valid email address. Remove broad Allow rules such as `Everyone` or an entire email domain, and review Bypass policies because they take precedence over Allow policies.

The Access application must cover the production hostname, every custom domain, and preview deployment hostnames. Disable public previews if they cannot be covered by the same policy.

## 4. Configure Pages variables and the private secret

Set these for both Production and Preview deployments:

| Name | Storage | Value |
| --- | --- | --- |
| `CF_ACCESS_TEAM_DOMAIN` | Variable | `<team-name>.cloudflareaccess.com` |
| `CF_ACCESS_AUD` | Variable | Every Railog Access application audience tag, separated by commas or new lines |
| `OCC_ALLOWED_EMAILS` | Encrypted secret | The exact 38 addresses, separated by commas or new lines |

The required count of 38 is fixed in reviewed code and cannot be expanded with a dashboard variable. The middleware returns `503` when any required setting is missing or the private allowlist does not contain exactly 38 unique addresses. It validates the `Cf-Access-Jwt-Assertion` signature against Cloudflare's rotating JWKS, plus the issuer, audience, expiry, and email membership.

If production, preview, or a custom domain uses a separate Access application, include each corresponding audience tag in the environment for that deployment scope. Production and Preview can have different `CF_ACCESS_AUD` values.

The only unauthenticated middleware exception is `GET` or `HEAD` under `/.well-known/acme-challenge/<token>`, which Cloudflare Pages may need for custom-domain certificate validation. That path must never serve application or API data.

## 5. Verify before operational use

1. An address from the list receives a One-time PIN and can open the app.
2. An address outside the list is denied.
3. Production, previews, custom domains, and `/api/*` routes are all protected.
4. Adding or removing an address causes the middleware to fail closed when the unique count is not 38. Replacing one address while keeping 38 entries immediately changes who is authorized after the secret is redeployed.

Official Cloudflare references:

- [One-time PIN](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/)
- [Access policies](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/)
- [Reusable lists](https://developers.cloudflare.com/cloudflare-one/reusable-components/lists/)
- [Validate Access JWTs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)

# Public OAuth information site

Google requires an External/In production OAuth app to have a publicly accessible home page, privacy policy, and terms page. The static files in [`oauth-info-site`](../oauth-info-site) provide those pages without exposing the Railog application or its authentication service.

## Cloudflare Pages project

Create a separate Git-connected Pages project with these exact settings:

| Setting | Value |
| --- | --- |
| Project name | `l3-dc-otp-info` |
| Repository | `naz1234/cloudflare_Railog` |
| Production branch | `main` |
| Framework preset | `None` |
| Root directory | `oauth-info-site` |
| Build command | Leave empty |
| Build output directory | `.` |

Do not add Pages Functions, environment variables, D1, service bindings, or secrets. Do not attach this hostname to the existing Cloudflare Access application. The separate root directory prevents the protected Railog `functions` middleware from being deployed with the public site.

After deployment, verify that these exact URLs load without a login prompt:

- `https://l3-dc-otp-info.pages.dev/`
- `https://l3-dc-otp-info.pages.dev/privacy/`
- `https://l3-dc-otp-info.pages.dev/terms/`

## Google Auth Platform Branding

Enter the deployed URLs under **Google Auth Platform > Branding**:

| Google field | Value |
| --- | --- |
| Application home page | `https://l3-dc-otp-info.pages.dev/` |
| Application privacy policy link | `https://l3-dc-otp-info.pages.dev/privacy/` |
| Application Terms of Service link | `https://l3-dc-otp-info.pages.dev/terms/` |
| Authorized domain | `l3-dc-otp-info.pages.dev` |

Save the Branding configuration, return to **Audience**, and publish the OAuth app to **In production**. Then authorize the dedicated Gmail sender again in OAuth Playground and replace the old seven-day Testing refresh token with the new token. Never commit or paste the client secret, refresh token, access token, or authentication codes into an issue or pull request.

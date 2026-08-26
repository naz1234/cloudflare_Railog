# Train Removal preset update

## Production access

Production uses the [custom approved-staff email-PIN system](docs/custom-pin-auth.md). Each user enters their own approved Flow Metro email address, receives a short-lived code at that address, and is identified by the verified session. The [Cloudflare Access configuration](docs/cloudflare-access.md) is retained as a rollback gate until the per-user mailer, Turnstile, D1 identity/presence migration, and full verification checklist pass.

The approved staff list is private configuration. Store it only in encrypted Cloudflare secrets; never commit staff addresses to this public repository, documentation, test fixtures, or deployment examples.

- 12am rows now use the same steel-blue whole-row theme as 7pm, Fri, Sat and PH.
- Selecting 12am under West Depot automatically selects 12am under East Depot.
- West and East 12am rows still restore from their own saved preset data.
- 7pm TIDs 207, 209 and 211 remain violet.
- Duplicate rows remain red and take visual priority.
- Lint and production build passed.
## West master preset sync

Selecting any removal preset on West Depot now automatically selects the matching preset on East Depot. Each depot keeps and restores its own saved rows.


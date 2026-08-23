# Train Removal preset update

## Production access

Production and preview deployments must follow the [L3 DC shared-address Cloudflare Access setup](docs/cloudflare-access.md). It uses One-time PIN, a single approved email address, and server-side Access JWT validation without committing the address to this public repository.

- 12am rows now use the same steel-blue whole-row theme as 7pm, Fri, Sat and PH.
- Selecting 12am under West Depot automatically selects 12am under East Depot.
- West and East 12am rows still restore from their own saved preset data.
- 7pm TIDs 207, 209 and 211 remain violet.
- Duplicate rows remain red and take visual priority.
- Lint and production build passed.
## West master preset sync

Selecting any removal preset on West Depot now automatically selects the matching preset on East Depot. Each depot keeps and restores its own saved rows.


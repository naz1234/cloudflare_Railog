# L3 DC authentication mailer

This private Worker is the only component allowed to send custom-login PIN emails. It has no `workers.dev`, preview, route, or custom-domain endpoint and is called from Pages through the `AUTH_EMAIL_SERVICE` Service binding. It exchanges a dedicated Gmail OAuth refresh token for a short-lived access token and uses the Gmail API `gmail.send` scope.

Before deployment:

1. Copy `wrangler.example.toml` to an untracked deployment configuration.
2. Create a dedicated Gmail account and an OAuth client restricted to the `https://www.googleapis.com/auth/gmail.send` scope.
3. Add encrypted Worker secrets for `AUTH_EMAIL_SERVICE_TOKEN`, `AUTH_EMAIL_FROM`, `AUTH_LOGIN_EMAIL`, `AUTH_GMAIL_CLIENT_ID`, `AUTH_GMAIL_CLIENT_SECRET`, and `AUTH_GMAIL_REFRESH_TOKEN`.
4. Deploy the Worker and bind it to Pages as `AUTH_EMAIL_SERVICE`.
5. Add the identical `AUTH_EMAIL_SERVICE_TOKEN` as an encrypted Pages secret.

The runtime fixes both the sender and recipient. The service request accepts only a six-digit `pin` and a short `requestRef`; it rejects `to`, `from`, and every other extra field. The browser and Pages app never receive Gmail OAuth credentials.

See [the complete staged deployment and cutover guide](../../docs/custom-pin-auth.md).

# L3 DC authentication mailer

This private Worker is the only component allowed to send custom-login PIN emails. It has no `workers.dev`, preview, route, or custom-domain endpoint and is called from Pages through the `AUTH_EMAIL_SERVICE` Service binding.

Before deployment:

1. Copy `wrangler.example.toml` to an untracked deployment configuration.
2. Replace both `.invalid` Email Service binding placeholders with the verified destination and onboarded sender.
3. Add encrypted Worker secrets for `AUTH_EMAIL_SERVICE_TOKEN`, `AUTH_EMAIL_FROM`, and `AUTH_LOGIN_EMAIL`.
4. Deploy the Worker and bind it to Pages as `AUTH_EMAIL_SERVICE`.
5. Add the identical `AUTH_EMAIL_SERVICE_TOKEN` as an encrypted Pages secret.

The binding and runtime both fix the sender and recipient. The service request accepts only a six-digit `pin` and a short `requestRef`; it rejects `to`, `from`, and every other extra field.

See [the complete staged deployment and cutover guide](../../docs/custom-pin-auth.md).

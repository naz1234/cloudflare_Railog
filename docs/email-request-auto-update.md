# Auto update Maintenance Request panel from email

This project now includes a webhook endpoint:

```txt
POST /api/email-request
```

When the endpoint receives email text, it creates rows in `MaintenanceRequest` inside Cloudflare D1. The Depot Stabling page already refreshes maintenance requests every 5 seconds, so the request panel will update automatically after the email webhook runs.

## 1) Add a secret token in Cloudflare Pages

Cloudflare Pages → your project → Settings → Environment variables → add:

```txt
EMAIL_IMPORT_TOKEN = choose-your-own-long-secret-token
```

Redeploy after saving the variable.

## 2) Power Automate setup for Outlook

Create a flow:

1. Trigger: **When a new email arrives (V3)**.
2. Optional condition/filter: only run for the request email sender or subject.
3. Action: **HTTP**.
4. Method: `POST`.
5. URI:

```txt
https://YOUR-PROJECT.pages.dev/api/email-request
```

6. Headers:

```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer YOUR_EMAIL_IMPORT_TOKEN"
}
```

7. Body:

```json
{
  "subject": "@{triggerOutputs()?['body/subject']}",
  "body": "@{triggerOutputs()?['body/bodyPreview']}",
  "from": "@{triggerOutputs()?['body/from/emailAddress/address']}",
  "messageId": "@{triggerOutputs()?['body/internetMessageId']}"
}
```

## Email text examples supported

```txt
36 28 44 15 10 20 requested by RST for today PM
```

Creates request rows for 36, 28, 44, 15, 10, 20 with:

```txt
Type: TODAY PM
Note: Requested by RST
```

```txt
10 04 12 22 requested by RST for tomorrow PM
```

Creates request rows for 10, 04, 12, 22 with:

```txt
Type: TMRW PM
Note: Requested by RST
```

```txt
24 41 requested for inbound movement from G to C
```

Creates request rows for 24, 41 with:

```txt
Type: INBOUND (G to C)
Note: Inbound movement G to C
```

## Manual test with curl

```bash
curl -X POST "https://YOUR-PROJECT.pages.dev/api/email-request" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_EMAIL_IMPORT_TOKEN" \
  -d '{"subject":"Train request","body":"36 28 44 requested by RST for today PM","messageId":"test-001"}'
```

The app prevents duplicate same train + same request type, so the same email should not keep creating repeated rows.

# brevo-mailer

Standalone script to send emails through Brevo's SMTP relay.

## Setup

1. `cd scripts/brevo-mailer && npm install`
2. `cp .env.example .env`
3. Fill in `.env`:
   - `BREVO_SMTP_LOGIN`: your Brevo account email
   - `BREVO_SMTP_KEY`: generated in Brevo dashboard -> **Settings -> SMTP & API -> SMTP tab** (this is NOT your account password)
   - `MAIL_FROM_EMAIL`: must be a sender verified in Brevo (Settings -> Senders)

## Usage

Plain text:
```bash
node send.js --to someone@example.com --subject "Hello" --text "Plain body"
```

HTML body inline:
```bash
node send.js --to someone@example.com --subject "Hello" --html --text "<h1>Hi</h1>"
```

HTML from a file:
```bash
node send.js --to someone@example.com --subject "Hello" --file ./template.html
```

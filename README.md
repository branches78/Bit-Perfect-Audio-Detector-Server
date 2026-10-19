# Bit-Perfect Detector — report server

Small **Node.js (Express) server** that receives the anonymous reports sent from the
[Bit-Perfect Detector app](https://github.com/branches78/Bit-Perfect-Detector) and forwards them to
the maintainer by email (through [Resend](https://resend.com)). **It stores nothing**: no database,
no files, no logs of the reports. After review, each phone is added by hand to the
[public table of phones](https://bit-perfect-detector-web.onrender.com).

This code is public so anyone can check what happens with a report.

## What a report contains

Only data about the phone and its audio capabilities, as shown in the app's send dialog before
sending: manufacturer, model and internal device name, Android version, the detected audio
capabilities (with and without a DAC), the name of the connected USB DAC, the names of compatible
music apps installed on the phone, and the technical details of the analysis.

**Reports are anonymous.** They don't include names, email addresses, accounts, contacts, location,
advertising IDs or any other data that identifies the person who sends them.

The server needs the sender's IP address for one thing: allowing one report every 48 hours. It never
stores it: it keeps only an HMAC of it in memory, with a random key created on every start, so the
IP can't be recovered. That value is deleted after 48 hours, or sooner if the server restarts.

## What it does with a report

1. Validates and cleans the report (`src/report.js`): unknown values are discarded, texts are
   trimmed and single-line fields lose line breaks. Reports from Android emulators (`sdk_gphone…`,
   `emu64…`, Genymotion…) are rejected with a 400, since Google Play's pre-launch report sends one
   from its virtual devices on every upload and they say nothing about real phones.
2. Cleans up the phone name: the brand gets a capital letter and isn't repeated when the model
   already includes it (`motorola` + `motorola edge 50 neo` → `Motorola edge 50 neo`). DAC names
   lose the `USB-Audio - ` prefix some phones add.
3. Some manufacturers report an internal code instead of the commercial name (Xiaomi `25113PN0EI`).
   The server looks it up, together with the device codename, in Google Play's official
   [list of supported devices](https://storage.googleapis.com/play_public/supported_devices.csv)
   (`src/devices.js`, downloaded on first use and kept in memory for 24 hours) and uses the
   commercial name (`Xiaomi 17`) when there's exactly one match; otherwise it keeps the original.
4. Emails the maintainer (`src/email.js`) a summary, the technical details attached, and the entry
   ready to publish in the website's table.

`src/names.js` holds name and format helpers that are copies of the website's own; when the
website's code is checked out next to this folder, `test/names.test.js` checks that both copies
give the same results.

## Routes

| Route | Purpose |
|---|---|
| `POST /api/reports` | Receives a report from the app and emails it. Max. 64 KB; one report per IP every 48 hours (429) and at most 50 reports a day in total (503 with the `X-Report-Limit: daily` header, which the app shows as its own message) |
| `GET /healthz` | Health check |
| `GET /` | Redirects to the website (`SITE_URL`) |

Both limits are kept in memory (`src/limits.js`) and reset when the service restarts. IPv6
addresses are grouped by their /64 block. Errors are answered with a short JSON message, never with
error details.

**Client IP behind Render's proxies.** On Render a request reaches the server through 3 proxies
(Cloudflare and two of Render's own), so `server.js` sets Express's `trust proxy` to `3` to get the
client's real IP. If you deploy elsewhere, log `req.ips` and the `X-Forwarded-For` header once and
adjust that number.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `RESEND_API_KEY` | Yes | In Resend: **API Keys** → create one with *Sending access*. |
| `REPORT_TO_EMAIL` | Yes | Address that receives the reports (several allowed, comma-separated). |
| `REPORT_FROM_EMAIL` | No | Sender. Defaults to `onboarding@resend.dev`, which can only send to your own Resend account's email. To use another sender, verify a domain in Resend. |
| `SITE_URL` | No | Public URL of the website. Opening the server in a browser redirects there. |
| `NODE_ENV` | No | Set it to `production`, so Express never shows error details. |
| `NODE_VERSION` | No | On Render, `22` (Node.js 22 or later is required). |

## Deploying on Render

Create a **Web Service** from this repository:

- **Runtime:** Node · **Build command:** `npm install` · **Start command:** `npm start`
- **Health check path:** `/healthz`
- **Environment:** the variables above.

On the free plan the service sleeps when idle. The app wakes it with an empty request to `/healthz`
when the user opens the send dialog, and waits up to 90 seconds when sending.

## Local development

Requires Node.js 22 or later.

```bash
npm install
npm start
```

Without the Resend variables, emails are printed to the console (including the entry to publish).
With `NODE_ENV=production` a missing variable is an error instead: the app is told the report wasn't
delivered, so it's never lost silently.
Tests: `npm test`.

## License

Copyright (C) 2026 Bit-Perfect Detector

This program is free software: you can redistribute it and/or modify it under the terms of the GNU
General Public License as published by the Free Software Foundation, either version 3 of the License,
or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even
the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
[GNU General Public License](LICENSE) for more details.

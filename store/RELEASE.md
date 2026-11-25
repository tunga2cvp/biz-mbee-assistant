# BIZ Mbee Assistant 1.1.0

Release build: `webmcp-extension/store-dist`; upload archive: `artifacts/BIZ-Mbee-Assistant-1.1.0.zip`.
Cloud backend: https://biz.thanhtunga2cvp.workers.dev.
Privacy: https://biz.thanhtunga2cvp.workers.dev/privacy.
Demo: https://biz.thanhtunga2cvp.workers.dev/demo.

The public extension requires an assistant account. Passwords are PBKDF2-SHA256 salted hashes in
`EXTENSION_USERS_JSON`, stored as a Cloudflare Secret. `EXTENSION_SESSION_SECRET` signs one-hour tokens.
The browser keeps the token in chrome.storage.session. Passwords are not persisted or bundled.
Changing users or the signing secret invalidates previous tokens. Logout clears the browser session and chats;
a previously copied token expires on the server at its existing expiry time.

The public build calls the Worker directly, with chat context retained in side-panel memory per chat/tab.
The original localhost POC build and the Worker's legacy message / shared-token inference routes remain separate.
The public release does not use their static token. Disable legacy routes separately when that POC is retired.

Worker configuration: `cloudflare/wrangler.jsonc`, source assembled by `cloudflare/build-worker.mjs`.
`EXTENSION_RATE_LIMITER` uses namespace 750101 and 10 requests per 60 seconds per keyed bucket.
Login is keyed by Cloudflare client address; inference by username. Cloudflare rate limits are approximate per location.
Optional `EXTENSION_ALLOWED_IDS` may restrict browser origins after the Chrome Store assigns an extension ID.
Credentials and deployment secret files are under the ignored `cloudflare/private` directory and must never be uploaded to the Store.

## Validation

- Typecheck passed; 221 upstream unit tests passed; 23 upstream scripted-model Chrome smoke tests passed.
- 12 Worker tests passed, including invalid credentials, forged/expired sessions, account revocation, origins and rate limiting.
- 6 local-auth browser acceptance checks passed using actual Qwen inference.
- 6 deployed-Worker browser checks passed: locked before login, wrong password, correct login/session storage,
  real cloud model/native callback loop, logout cleanup, expiry relock. Evidence: `artifacts/auth-live-acceptance`.
- These are independent synthetic demo tests. Internal BIZ workflows and alternate models are not verified here.

Store text, permission explanations and contact are in `store/listing.json`.
Store screenshots show the actual login and consent UI. Avatar source and built-in imagegen edit prompt are in `store/asset-source.json`.

## Rebuild

Use Node >=22.18. Run `node cloudflare/build-worker.mjs`, then within the extension checkout run
`node scripts/buildStore.ts`. Credentials are set as Worker Secrets, not build arguments.
The extension ZIP must contain manifest.json at its root and only store-dist contents.

## Reviewer steps

Supply an assistant test account in the dashboard's private test-instructions area, not in the public listing.
Enable WebMCP testing if required by the review Chrome build. Open the public demo, sign into the extension,
acknowledge the consent screen and ask it to fill demo values. Verify the permission prompt before Allow.
Try registering the third calculator tool and ask for 3 items at 12000 each.

## Chrome Web Store submission

Version 1.1.0 was uploaded and submitted on 20 November 2026 (Asia/Saigon). The dashboard confirmed
"Pending review". It is not publicly available yet. Automatic publication after approval is enabled.

Extension ID: `opifljgebjckcihkflechmdolimljfln`.
Publisher is a personal non-trader with verified contact `thanhtunga2cvp@gmail.com`.
Distribution is public, free, in all regions. Login credentials and reviewer instructions were saved
in the dashboard's private test-credentials area, separate from the public listing.

Dashboard: https://chrome.google.com/webstore/devconsole/f2fcd11f-511e-40a3-9c4e-e230ddad9aba/opifljgebjckcihkflechmdolimljfln/edit/status.
Google warned that broad host permissions may require additional review. Current status is in
`store/PUBLICATION-STATUS.json`; approval and publication remain subject to Google's review.

# WebMCP external agent POC

Source: https://github.com/GoogleChromeLabs/webmcp-extension

Pinned upstream commit: `1d6a1c5da0096339d70dd6da4c98390746d7381b`.
Chrome on this machine: 157.0.8103.79. Build/test runtime: Node 24.22.1.

## Run on this machine

The default Node is v20. Use `poc.ps1`, which selects an existing Node >=22.18.
The local provider configuration is in `webmcp-extension/.env`; it is excluded from Git and delivery archives.

```powershell
.\poc.ps1 Server
# In a separate PowerShell:
.\poc.ps1 Demo
```

Open `http://127.0.0.1:8088`. In a test Chrome profile, enable WebMCP testing if required,
load `webmcp-extension/dist` through `chrome://extensions` → Developer mode → Load unpacked,
and open WebMCP Extension. Keep the server backend and sensitive action alerts enabled.

```powershell
.\poc.ps1 Build
.\poc.ps1 Typecheck
.\poc.ps1 Unit
.\poc.ps1 Smoke
.\poc.ps1 VerifyProvider
.\poc.ps1 Acceptance
```

## Changes

- Upstream agent runtime, discovery, permissions and Chat Completions provider are reused.
- Three generic system instructions add language matching, asking for missing values and honest action reporting.
- `demo/` contains the independent native WebMCP page from the handoff, without a polyfill.
- `cloudflare/worker.js` preserves the original `{message}` path and adds `/v1/chat/completions`.
  Both use the existing `AI` binding and `POC_TOKEN` secret. No secret is hardcoded in Worker source.
- Native OpenAI tool-call/text SSE deltas pass through. Only the binding's extra empty `response` usage trailer
  is normalized into an OpenAI usage chunk; no text is parsed into invented tool calls.
- `cloudflare/worker.original.js` backs up the original Worker. The Cloudflare dashboard retains deployment versions too.

## Verified

- Extension typecheck: passed.
- Upstream unit tests: 221 passed.
- Upstream Chrome smoke tests: 23 passed, using the suite's scripted model (infrastructure only).
- Worker tests: 5 passed, including unchanged legacy behavior and fragmented SSE handling.
- Real Qwen inference through AI SDK: passed native streaming tool call with `3` and `12000`,
  then accepted a test-supplied tool result and answered `36000`.
  See `provider-verification.json`. This provider test alone does not verify a browser callback.
- Real browser acceptance: all eight core checks passed across the main run and an isolated tab-isolation retry.
  Actual page screenshots, panel transcripts and model/tool traces are under `artifacts/acceptance/`.

Browser acceptance status and remaining cases are recorded in `ACCEPTANCE.md`.
`Acceptance` uses an isolated temporary headless Chrome profile and real inference through the running local server.
It never types values into the demo form: only the page's native WebMCP callbacks can fill it.
Run Server and Demo first. Traces contain only synthetic demo data, and screenshots are saved under `artifacts/acceptance`.

## Transfer/rebuild

The handoff ZIP includes patched source and dist, without node_modules or .env. To reconstruct from upstream instead,
clone the pinned repository outside internal BIZ sources and apply `extension.patch`. Install dependencies
with Node >=22.18 using `npm ci --ignore-scripts`, create `.env` from `cloudflare/poc.env.example`,
and build. Provider credentials stay on the local server. Generate a new local server token for another machine;
rebuild the extension and restart its server together. Extension archives contain that build's local server token
by upstream design, but do not contain the provider token or `.env`.

No internal BIZ source or customer data is included. BIZ acceptance remains a separate step in an approved environment.

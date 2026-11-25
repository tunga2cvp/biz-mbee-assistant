# Acceptance record

Provider: Cloudflare Workers AI, `@cf/qwen/qwen3.8-27b`, through the upstream OpenAI Chat Completions adapter.
Upstream commit: `1d6a1c5da0096339d70dd6da4c98390746d7381b`.
Chrome: 157.0.8103.79. All page data used in testing is synthetic.

| Check | Status | Evidence |
|---|---|---|
| Real provider tool calling and tool-result continuation | Passed | provider-verification.json; supplied test result, not browser execution |
| Extension infrastructure | Passed | 221 unit tests, 23 Chrome smoke tests with scripted model |
| Worker compatibility and request limits | Passed | 5 Worker tests |
| Native discovery on independent demo | Passed | results.json, initial two tools discovered using native API |
| Vietnamese request fills form through native callback | Passed | 02-permission and 03-filled page screenshots/panel transcripts; real tool call/result in trace.json |
| Missing field and multi-turn completion | Passed | 04-missing-field and 05-multiturn; form stays blank until username supplied and permission granted |
| Denied permission leaves form unchanged | Passed | 06-denied; model explicitly reports denial |
| Newly registered tool calculates 36000 | Passed | 07-new-tool; live discovery becomes three tools, real callback result in trace.json |
| Unregistered tools cannot run | Passed | 08-no-tools; no native tools, no form fill, model reports capability unavailable |
| Separate browser tabs keep separate chats | Passed on isolated retry | results-tab-isolation.json, trace-tab-isolation.json, 09-separate-tab |
| Alternate model | Not tested | No alternate provider selected |
| BIZ internal environment | Not tested | Outside this external POC |

Evidence is under `artifacts/acceptance/`. The first run reached the separate-tab prompt but was interrupted
while waiting for the model; its original `run: failed` record is retained in results.json.
The isolated retry seeded PREVUSER42 in one tab, opened a new tab, and verified that NEWTAB still required
a username and did not run the write callback. Do not count the interrupted attempt as a pass.

All eight core checks passed across the main run and isolated retry. Browser tests use a temporary headless
Chrome profile, the built extension, native document.modelContext, the real local server and real Qwen inference.
The test only reads the demo inputs; it never assigns their values. Background panel screenshots stalled on
this Windows Chrome build, so evidence includes actual page PNGs and panel text transcripts instead.

Cloudflare active Worker version after the SSE fix: `5b25d71e` (short ID observed in dashboard).
The existing legacy message route is preserved. Provider keys and local server auth headers are excluded from traces.

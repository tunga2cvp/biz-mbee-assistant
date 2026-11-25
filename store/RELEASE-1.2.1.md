# BIZ Mbee Assistant 1.2.1 — token usage

Adds the expandable **Token đã ghi nhận** section below the model selector. It shows the latest
model request and totals for input, output and total tokens, split by model. Every completed model
request is counted, including tool-call rounds and the follow-up model request with the tool result.
Input includes the system prompt, conversation history, tool definitions and tool results.

Numbers come from AI SDK `result.totalUsage`, using Cloudflare's final usage event. Cached input
and reasoning tokens are shown as subsets, never added twice. Accepted inference streams that fail
or are cancelled before usage arrives are marked incomplete. Calls that never return a response
may be absent. No token count is estimated from text length.

Totals live only in the current panel's memory. They survive chat/model changes, and reset when the
panel closes/reloads or the user logs out. Late results from a previous authentication epoch cannot
change a new session's totals. Only numeric counts and model IDs are held by this store.

This does not retrieve past usage, other panels, other devices, or the Cloudflare account's bill.
No Worker deployment, new permissions or credentials are required.

## Verification

- Typecheck passed and three unit checks passed: per-model/tool-round sums, missing usage and logout isolation.
- Live browser checks passed for both Qwen and Granite, with native WebMCP callbacks and actual Cloudflare AI.
- The panel's input, output and total counts matched the final provider usage for every request.
- Model changes retained both models' totals, and reload reset the counters.
- Evidence: `artifacts/token-usage/browser-results.json`, `provider-usage.json`, `token-usage.png`.
- One synthetic form task used 1,963 tokens on Qwen (1,789 in / 174 out) and 1,559 on Granite
  (1,504 in / 55 out) in the recorded run. These are example workloads, not a model-quality benchmark.

Package: `artifacts/BIZ-Mbee-Assistant-1.2.1.zip`.

## Store update — 25 November 2026

The dashboard confirmed that 1.1.0 was published publicly. Version 1.2.1 was uploaded and submitted
as an update; Google confirmed pending review. Automatic publication after approval is enabled.
The public version remains 1.1.0 while the update is reviewed.

The package SHA-256 is `E54E42AE66A50F2FEE858881A6CDAC4E90D3C84674F2A3EFB8E27077E71846BB`.
On 25 November 2026, typecheck, 226 extension unit tests and 14 Worker tests passed. The live Worker
reviewer login/session were verified. The Store description and private reviewer instructions now
cover model selection and token usage. Credentials remain only in the private review area.

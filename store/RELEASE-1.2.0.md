# BIZ Mbee Assistant 1.2.0 — model selection

The signed-in panel now has a Model AI selector: Qwen 3.8 27B (default) and Granite 4.0 H Micro (3B).
Selection is remembered locally. Changing it resets conversations and remembered tool grants across
the panel's tabs, while keeping discovered page tools. Switching is disabled while any turn or
permission prompt is pending. Each backend chat pins its model across all tool-result turns.

The Worker validates the selected model against `webmcp-extension/shared/cloudModels.json`.
Unknown IDs are rejected with HTTP 400 before inference. The old 1.1.0 placeholder still maps to Qwen.
The legacy POC endpoint keeps its existing configured-model behavior.

Granite uses native non-streamed Chat Completions internally, returned as one SSE completion to the
extension. This avoids its current streaming failure with tool-result history. Null assistant text
is represented as an empty string for Granite's template. Native structured calls and results are
preserved; model prose is never parsed into calls. One extra JSON string layer in native arguments
is decoded to an object; invalid primitives, arrays and malformed JSON are rejected.

## Verified

- Typecheck and 221 existing unit tests passed; two new argument-normalization checks passed.
- 14 Worker tests passed, including model allowlist, routing, old-client compatibility and Granite history.
- Both actual Cloudflare models completed the tool-call/result loop with quantity 3, price 12000, answer 36000.
- Four deployed-Worker browser checks passed using native WebMCP callbacks in an isolated Chrome profile:
  Qwen callback, model-switch conversation reset, Granite callback, and selection persistence/revert.
  Both turns checked routing and disabled switching while permission was pending.
- Evidence: `artifacts/model-selection/provider-results.json`, `browser-results.json`, `browser-trace.json`, `model-picker.png`.
- The isolated browser test keeps its extension tab visible with CDP focus emulation, matching a real
  visible side panel while the demo remains the active tab. Models and page callbacks are not mocked.

## Distribution

`artifacts/BIZ-Mbee-Assistant-1.2.0.zip` is the local test package. The installed unpacked extension
was reloaded from `webmcp-extension/store-dist` and Chrome showed 1.2.0.
Worker version prefix: `7d23b314`. No new secrets or permissions are required.

Chrome Web Store still has the submitted 1.1.0 pending review. This local 1.2.0 has not replaced that
submission. The backend remains compatible with 1.1.0 and defaults it to Qwen.

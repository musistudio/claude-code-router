# Gateway release patches

`ai-gateway-stream-terminal-error.patch` applies to the source revision pinned in
`.github/actions/prepare-release-gateway/action.yml`:
`0a2c0abd48d2144ed0ac2ce4d954a661c51ffcb1`.

It incorporates [ai-gateway PR #39](https://github.com/The-NeXT-AI/ai-gateway/pull/39)
to end interrupted upstream SSE streams with a protocol-native error. CCR adds
the same protection after live protocol conversion, typed byte storage for large
SSE lines, and a 64 MiB heap regression. Cancellation and already delivered
terminal events do not get an additional terminal error. Exception text and
provider URLs are never copied into the generated error.

The release action applies this patch to its isolated gateway checkout before
typechecking, running the upstream regressions, and packing the dependency. For
a local source build, apply all three patches in the order used by the release action to an isolated checkout of that revision, build
the gateway, and set `CCR_GATEWAY_SOURCE_DIR` (or
`CCR_DOCKER_GATEWAY_SOURCE_DIR` for Docker) to that checkout. Set
`CCR_TEST_GATEWAY_ENTRY` to its `dist/index.js` when running CCR's wire tests.
The registry package alone does not contain this unreleased fix. Remove the
patch when updating the pinned gateway to a revision containing these changes.

`ai-gateway-native-safeguards.patch` applies after the stream patch. It preserves
opaque native Anthropic request/response fields while a virtual model passes
through the standard representation, including safeguards, verdicts and future
fields. Symbol metadata stays internal and is not serialized into other
protocols. Buffered and optimistic SSE retain the native verdict and tool IDs.
Virtual profiles with internal gateway tools reject safeguards requests before
an upstream call or tool execution: their tool execution owner differs from the
client-owned execution expected by the native protocol. Ordinary native models
and virtual profiles without internal tools support the transparent path.

`ai-gateway-nonstream-stream-error.patch` applies last. The Codex backend can
answer HTTP 200 and end the stream with an `error` event and an empty `output`,
for example when a request is blocked by a content policy. The non-stream
collector dropped that event, so the aggregated payload was empty: callers saw a
generic 502 for empty model output, the upstream code and message were lost, and
one automatic retry re-sent a request that could not succeed. The patch records
the first `error`, `response.error` or `response.failed` event and uses its code
and message as the content when the payload would otherwise carry no text.
Streams without an error event are unchanged. It incorporates
[ai-gateway PR #45](https://github.com/The-NeXT-AI/ai-gateway/pull/45).

The upstream code is MIT licensed:

Copyright (c) 2026 musistudio

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

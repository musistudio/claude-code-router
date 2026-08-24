import assert from "node:assert/strict";
import test from "node:test";
import { xquikSearchResults, xquikSearchUrl } from "@ccr/core/mcp/xquik-search.ts";

test("Xquik search builds a bounded recent-post request", () => {
  const url = new URL(xquikSearchUrl("https://example.test/search?source=ccr", "router news", 99, "en"));

  assert.equal(url.origin, "https://example.test");
  assert.equal(url.pathname, "/search");
  assert.equal(url.searchParams.get("source"), "ccr");
  assert.equal(url.searchParams.get("q"), "router news");
  assert.equal(url.searchParams.get("queryType"), "Latest");
  assert.equal(url.searchParams.get("limit"), "25");
  assert.equal(url.searchParams.get("language"), "en");
  assert.equal(url.searchParams.get("replies"), "exclude");
  assert.equal(url.searchParams.get("retweets"), "exclude");
  assert.equal(url.searchParams.get("quotes"), "exclude");
});

test("Xquik search converts valid unique posts into cited results", () => {
  const longText = `First\npost\u0000 ${"x".repeat(1300)}`;
  const results = xquikSearchResults({
    tweets: [
      { author: { username: "valid_user" }, id: "123456789", text: longText },
      { author: { username: "valid_user" }, id: "123456789", text: "duplicate" },
      { author: { username: "not-valid!" }, id: "987654321", text: "Second post" },
      { author: { username: "ignored" }, id: "javascript:alert(1)", text: "Unsafe ID" }
    ]
  }, 2);

  assert.equal(results.length, 2);
  assert.equal(results[0].title, "Post by @valid_user on X");
  assert.equal(results[0].url, "https://x.com/valid_user/status/123456789");
  assert.equal(results[0].snippet?.includes("\n"), false);
  assert.equal(results[0].snippet?.includes("\u0000"), false);
  assert.equal(results[0].snippet?.length, 1200);
  assert.deepEqual(results[1], {
    snippet: "Second post",
    title: "Post on X",
    url: "https://x.com/i/web/status/987654321"
  });
});

test("Xquik search rejects malformed response payloads", () => {
  assert.deepEqual(xquikSearchResults(undefined, 5), []);
  assert.deepEqual(xquikSearchResults({ tweets: "not-an-array" }, 5), []);
});

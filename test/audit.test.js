import assert from "node:assert/strict";
import test from "node:test";
import {
  auditListing,
  auditManifest,
  classifySnapshot,
  parseGitHubIssueUrl,
} from "../src/audit.js";

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function mockFetch(routes) {
  return async (url) => {
    const path = new URL(url).pathname + new URL(url).search;
    for (const [pattern, body, status = 200] of routes) {
      if (typeof pattern === "string" ? path === pattern : pattern.test(path)) {
        return response(body, status);
      }
    }
    throw new Error(`Unexpected request: ${path}`);
  };
}

test("parses a canonical GitHub issue URL", () => {
  assert.deepEqual(parseGitHubIssueUrl("https://github.com/acme/widget/issues/42"), {
    owner: "acme",
    repo: "widget",
    issueNumber: 42,
  });
});

test("rejects non-issue and non-GitHub URLs", () => {
  assert.throws(() => parseGitHubIssueUrl("https://example.com/issues/1"));
  assert.throws(() => parseGitHubIssueUrl("https://github.com/acme/widget/pull/1"));
});

test("classification precedence marks archived repositories stale", () => {
  assert.deepEqual(
    classifySnapshot({
      repository: { archived: true, disabled: false },
      issue: { state: "open", assignees: [{ login: "owner" }] },
      pullRequests: [{ url: "https://github.com/acme/widget/pull/7" }],
    }),
    {
      classification: "stale",
      reasons: ["repository_archived", "issue_assigned", "matching_pull_requests_exist"],
    },
  );
});

test("marks an open assigned issue without PRs assigned", () => {
  assert.equal(
    classifySnapshot({
      repository: { archived: false, disabled: false },
      issue: { state: "open", assignees: [{ login: "alice" }] },
      pullRequests: [],
    }).classification,
    "assigned",
  );
});

test("detects a cross-referenced pull request and returns evidence", async () => {
  const fetchImpl = mockFetch([
    ["/repos/acme/widget", { html_url: "https://github.com/acme/widget", archived: false, disabled: false }],
    ["/repos/acme/widget/issues/42", { state: "open", assignees: [] }],
    [
      "/repos/acme/widget/issues/42/timeline?per_page=100",
      [
        {
          event: "cross-referenced",
          source: {
            issue: {
              number: 77,
              title: "Fix widget",
              state: "open",
              html_url: "https://github.com/acme/widget/pull/77",
              pull_request: { merged_at: null },
            },
          },
        },
      ],
    ],
  ]);

  const result = await auditListing(
    {
      marketplace: "Example",
      listing: "Widget bounty",
      sourceIssueUrl: "https://github.com/acme/widget/issues/42",
    },
    { fetchImpl, now: "2026-07-19T00:00:00.000Z" },
  );

  assert.equal(result.classification, "contested");
  assert.equal(result.pullRequests[0].url, "https://github.com/acme/widget/pull/77");
  assert.equal(result.checkedAt, "2026-07-19T00:00:00.000Z");
});

test("deduplicates PR evidence found in timeline and title search", async () => {
  const pull = {
    number: 77,
    title: "Fix unique widget edge case",
    state: "open",
    html_url: "https://github.com/acme/widget/pull/77",
    pull_request: { merged_at: null },
  };
  const fetchImpl = mockFetch([
    ["/repos/acme/widget", { html_url: "https://github.com/acme/widget", archived: false, disabled: false }],
    ["/repos/acme/widget/issues/42", { state: "open", assignees: [] }],
    [
      "/repos/acme/widget/issues/42/timeline?per_page=100",
      [{ event: "cross-referenced", source: { issue: pull } }],
    ],
    [/^\/search\/issues\?q=/, { items: [pull] }],
  ]);

  const result = await auditListing(
    {
      listing: "Widget bounty",
      sourceIssueUrl: "https://github.com/acme/widget/issues/42",
      searchTerms: ["unique widget edge case"],
    },
    { fetchImpl },
  );

  assert.equal(result.pullRequests.length, 1);
});

test("returns source_not_found without aborting a batch", async () => {
  const fetchImpl = mockFetch([
    [/^\/repos\/acme\/missing/, { message: "Not Found" }, 404],
  ]);
  const result = await auditListing(
    {
      listing: "Missing bounty",
      sourceIssueUrl: "https://github.com/acme/missing/issues/1",
    },
    { fetchImpl },
  );
  assert.equal(result.classification, "error");
  assert.deepEqual(result.reasons, ["source_not_found"]);
});

test("validates every manifest item", async () => {
  await assert.rejects(() => auditManifest({}), /JSON array/);
  await assert.rejects(() => auditManifest([{}]), /requires listing and sourceIssueUrl/);
});


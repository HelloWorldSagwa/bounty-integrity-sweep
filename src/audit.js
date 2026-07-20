const GITHUB_API = "https://api.github.com";

export function parseGitHubIssueUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid GitHub issue URL: ${value}`);
  }

  if (url.hostname !== "github.com") {
    throw new Error(`Only github.com issue URLs are supported: ${value}`);
  }

  const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/issues\/(\d+)\/?$/);
  if (!match) {
    throw new Error(`Expected https://github.com/owner/repo/issues/number: ${value}`);
  }

  return { owner: match[1], repo: match[2], issueNumber: Number(match[3]) };
}

function githubHeaders(token) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "bounty-integrity-sweep/0.1",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function getJson(fetchImpl, path, token) {
  const response = await fetchImpl(`${GITHUB_API}${path}`, {
    headers: githubHeaders(token),
  });

  if (!response.ok) {
    const body = await response.text();
    const error = new Error(`GitHub API ${response.status}: ${body.slice(0, 240)}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function pullRequestFromTimeline(event) {
  if (event.event !== "cross-referenced") return null;
  const issue = event.source?.issue;
  if (!issue?.pull_request || !issue.html_url) return null;
  return {
    number: issue.number,
    title: issue.title,
    state: issue.state,
    url: issue.html_url,
    mergedAt: issue.pull_request.merged_at ?? null,
    source: "timeline",
  };
}

function uniquePullRequests(items) {
  const byUrl = new Map();
  for (const item of items.filter(Boolean)) byUrl.set(item.url, item);
  return [...byUrl.values()];
}

async function searchPullRequests(fetchImpl, owner, repo, terms, token) {
  const results = [];
  for (const term of terms ?? []) {
    if (typeof term !== "string" || term.trim().length < 4) continue;
    const query = `repo:${owner}/${repo} is:pr in:title \"${term.trim()}\"`;
    const data = await getJson(
      fetchImpl,
      `/search/issues?q=${encodeURIComponent(query)}&per_page=20`,
      token,
    );
    for (const item of data.items ?? []) {
      results.push({
        number: item.number,
        title: item.title,
        state: item.state,
        url: item.html_url,
        mergedAt: item.pull_request?.merged_at ?? null,
        source: `search:${term.trim()}`,
      });
    }
  }
  return results;
}

export function classifySnapshot({ repository, issue, pullRequests }) {
  const reasons = [];

  if (repository.archived) reasons.push("repository_archived");
  if (repository.disabled) reasons.push("repository_disabled");
  if (issue.state !== "open") reasons.push(`issue_${issue.state}`);

  const assignees = issue.assignees ?? [];
  if (assignees.length > 0) reasons.push("issue_assigned");

  if (pullRequests.length > 0) reasons.push("matching_pull_requests_exist");

  let classification = "clean";
  if (reasons.some((reason) => ["repository_archived", "repository_disabled"].includes(reason))) {
    classification = "stale";
  } else if (issue.state !== "open") {
    classification = "stale";
  } else if (pullRequests.length > 0) {
    classification = "contested";
  } else if (assignees.length > 0) {
    classification = "assigned";
  }

  return { classification, reasons };
}

export async function auditListing(listing, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const token = options.token;
  const { owner, repo, issueNumber } = parseGitHubIssueUrl(listing.sourceIssueUrl);
  const repoPath = `/repos/${owner}/${repo}`;

  try {
    const [repository, issue, timeline, searchedPullRequests] = await Promise.all([
      getJson(fetchImpl, repoPath, token),
      getJson(fetchImpl, `${repoPath}/issues/${issueNumber}`, token),
      getJson(fetchImpl, `${repoPath}/issues/${issueNumber}/timeline?per_page=100`, token),
      searchPullRequests(fetchImpl, owner, repo, listing.searchTerms, token),
    ]);

    const timelinePullRequests = (timeline ?? []).map(pullRequestFromTimeline);
    const pullRequests = uniquePullRequests([
      ...timelinePullRequests,
      ...searchedPullRequests,
    ]);
    const verdict = classifySnapshot({ repository, issue, pullRequests });

    return {
      marketplace: listing.marketplace ?? "",
      listing: listing.listing,
      advertisedAmount: listing.advertisedAmount ?? "",
      sourceIssueUrl: listing.sourceIssueUrl,
      repositoryUrl: repository.html_url,
      repositoryArchived: Boolean(repository.archived),
      issueState: issue.state,
      assignees: (issue.assignees ?? []).map((assignee) => assignee.login),
      pullRequests,
      ...verdict,
      checkedAt: new Date(options.now ?? Date.now()).toISOString(),
    };
  } catch (error) {
    return {
      marketplace: listing.marketplace ?? "",
      listing: listing.listing,
      advertisedAmount: listing.advertisedAmount ?? "",
      sourceIssueUrl: listing.sourceIssueUrl,
      classification: "error",
      reasons: [error.status === 404 ? "source_not_found" : "github_api_error"],
      error: error.message,
      checkedAt: new Date(options.now ?? Date.now()).toISOString(),
    };
  }
}

export async function auditManifest(manifest, options = {}) {
  if (!Array.isArray(manifest)) throw new Error("Manifest must be a JSON array");
  for (const [index, listing] of manifest.entries()) {
    if (!listing || typeof listing !== "object") {
      throw new Error(`Manifest item ${index} must be an object`);
    }
    if (!listing.listing || !listing.sourceIssueUrl) {
      throw new Error(`Manifest item ${index} requires listing and sourceIssueUrl`);
    }
  }

  const results = [];
  for (const listing of manifest) {
    results.push(await auditListing(listing, options));
  }
  return results;
}


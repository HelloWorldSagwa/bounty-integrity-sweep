# Bounty Integrity Sweep

An evidence-first CLI that checks whether an advertised open-source bounty is still realistically claimable.

Marketplaces can drift away from their source of truth: an issue closes, a maintainer assigns it, a repository is archived, or implementation pull requests appear while the listing still looks open. Bounty Integrity Sweep turns those signals into a reviewable JSON or CSV queue.

It uses public GitHub data only and never writes to GitHub.

## Why this exists

Stale bounty listings waste contributor time and create duplicate review work. A marketplace operator—or a contributor doing due diligence—should be able to answer four questions before work begins:

1. Is the source repository active?
2. Is the source issue still open and unassigned?
3. Is an implementation already linked or under review?
4. What evidence supports the answer?

This project makes that check reproducible. It does not decide who deserves a payout and does not replace maintainer review.

## What it checks

- repository existence, archived state, and disabled state;
- current source-issue state and assignees;
- pull requests cross-referenced in the issue timeline;
- optional, narrowly scoped pull-request title searches;
- direct evidence URLs for every adverse finding.

Results are classified as:

| Classification | Meaning |
|---|---|
| `clean` | No adverse signal was detected by the configured checks. |
| `assigned` | The source issue is open but already assigned. |
| `contested` | One or more matching or cross-referenced PRs exist. |
| `stale` | The issue is not open, or the repository is archived/disabled. |
| `error` | The source could not be checked; the batch continues. |

`clean` means “no signal detected,” not “guaranteed payable.” Always read the marketplace rules and confirm with the maintainer.

## Requirements

- Node.js 20 or newer
- A network connection to GitHub's public API
- Optional: `GITHUB_TOKEN` for a higher API rate limit

No runtime package installation is required.

## Quick start

Clone the repository and run the tests:

```bash
npm test
```

Create a JSON manifest:

```json
[
  {
    "marketplace": "Example",
    "listing": "Fix parser edge case",
    "advertisedAmount": "200 USD",
    "sourceIssueUrl": "https://github.com/org/repo/issues/123",
    "searchTerms": ["parser edge case"]
  }
]
```

Run an audit:

```bash
npm run audit -- manifest.json --format json
npm run audit -- manifest.json --format csv
```

See [`examples/sample-manifest.json`](examples/sample-manifest.json) for a complete example.

`searchTerms` is optional. Use a narrow, distinctive phrase. Broad terms can return unrelated pull requests and should be treated as review hints, not proof.

## Output

Each row contains the advertised listing, source issue, classification, machine-readable reasons, assignees, matching PR URLs, and check timestamp. Per-listing API errors are returned as `classification: "error"`, allowing the rest of the batch to complete.

Example verdict:

```json
{
  "listing": "Fix parser edge case",
  "classification": "contested",
  "reasons": ["matching_pull_requests_exist"],
  "pullRequests": [
    {
      "url": "https://github.com/org/repo/pull/456",
      "source": "timeline"
    }
  ]
}
```

## Authentication and rate limits

Unauthenticated requests work for small samples. For larger audits, provide a token through the environment:

```bash
GITHUB_TOKEN=your_read_only_token npm run audit -- manifest.json --format json
```

Use the least privilege necessary. Never commit tokens or include them in a manifest.

## Responsible use

- Audit public repository metadata only.
- Treat automated matches as evidence for human review, not accusations.
- Do not contact maintainers in bulk or create duplicate PRs.
- Recheck a finding before publishing it; repository state changes quickly.
- Follow each marketplace's rules and GitHub's acceptable-use policies.

## Development

```bash
npm test
```

The test suite uses Node's built-in test runner and mocked GitHub responses. See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidance and [SECURITY.md](SECURITY.md) for private vulnerability reporting instructions.

## License

MIT

#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { auditManifest } from "./audit.js";

function csvCell(value) {
  const text = Array.isArray(value) ? value.join(" | ") : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function toCsv(results) {
  const fields = [
    "marketplace",
    "listing",
    "advertisedAmount",
    "classification",
    "reasons",
    "sourceIssueUrl",
    "assignees",
    "pullRequestUrls",
    "checkedAt",
  ];
  const rows = [fields.map(csvCell).join(",")];
  for (const result of results) {
    const row = {
      ...result,
      pullRequestUrls: (result.pullRequests ?? []).map((pullRequest) => pullRequest.url),
    };
    rows.push(fields.map((field) => csvCell(row[field])).join(","));
  }
  return `${rows.join("\n")}\n`;
}

function usage() {
  return "Usage: node src/cli.js manifest.json [--format json|csv]";
}

async function main() {
  const [manifestPath, flag, formatValue] = process.argv.slice(2);
  if (!manifestPath || (flag && flag !== "--format")) throw new Error(usage());
  const format = formatValue ?? "json";
  if (!new Set(["json", "csv"]).has(format)) throw new Error(usage());

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const results = await auditManifest(manifest, { token: process.env.GITHUB_TOKEN });
  process.stdout.write(format === "csv" ? toCsv(results) : `${JSON.stringify(results, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});


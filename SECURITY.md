# Security Policy

## Reporting a vulnerability

Please do not open a public issue for a vulnerability that could expose credentials or private data. Use GitHub's private vulnerability reporting feature when it is available for this repository.

Include a minimal reproduction, affected version, impact, and any suggested remediation. Do not include real access tokens.

## Supported versions

Security fixes are applied to the latest version on the default branch.

## Scope

The CLI is designed to read public GitHub metadata. Behavior that unexpectedly writes to GitHub, exposes a token, or sends private data is considered a security issue.

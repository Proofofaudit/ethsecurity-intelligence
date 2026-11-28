# Security policy

## Reporting a vulnerability

Report vulnerabilities in this project privately.

- Preferred: GitHub private vulnerability reporting, under the repository's **Security** tab, **Report a vulnerability** ([link](https://github.com/Proofofaudit/ethsecurity-intelligence/security/advisories/new)). This feature was not yet enabled on the repository when this file was written (26 Nov 2026). Until it is, open a public issue titled "Security contact request" that contains no details, and a maintainer will reply with a private channel.
- Do not describe a vulnerability in a public issue.
- Do not put vulnerability details in the public correction form or in an evidence correction issue. Corrections are published.
- Include the affected route or file, steps to reproduce and the impact you observed.

## Vulnerabilities in initiatives

This site researches initiatives; it does not handle their security reports. If you find a vulnerability in an initiative's code or deployment, report it to that project through its own security policy, not here.

## Scope

In scope: this repository's web app, `/api/v1`, the MCP server (`/api/mcp` and stdio), the research pipeline and the published dataset.

## What the app does to limit risk

- Read-only data APIs and MCP tools. Writes are limited to correction submission (validated, rate limited to five per hour per keyed address hash) and moderation (bearer token, disabled while `MODERATOR_TOKEN` is unset).
- Request size limits on JSON bodies, a Content-Security-Policy, `nosniff` and related headers in `next.config.ts`.
- Optional correction contacts are encrypted with AES-256-GCM and deleted after 30 days. Submitting network addresses are stored only as an HMAC.
- No wallet connection, no analytics and no third-party requests from the browser.
- Secrets live only in environment variables. Error messages redact database hosts and credentials (`lib/db/redact.ts`).

## Supported versions

Only the latest commit on the default branch is supported.

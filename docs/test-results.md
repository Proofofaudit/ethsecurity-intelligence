# Test results

Recorded on 27 Nov 2026 (UTC), docs last updated at 12:15 UTC, on branch `feat/full-platform`, Node.js 22.23, in the development sandbox. CI reruns the same checks on every push ([.github/workflows/ci.yml](../.github/workflows/ci.yml)). The checks below were rerun after the final code change of this review round.

| Check | Command | Result |
| --- | --- | --- |
| Truth audit and publish | `npm run publish` | Pass: "Truth audit: 7510 checks, 0 failures"; 55 initiatives, 519 claims, 1038 evidence, 79 repos, 83 organizations, 600 relationships, 232 changes |
| Type check | `npm run typecheck` | Pass |
| Lint | `npm run lint` | Pass |
| Neutral-language lint | `npm run lint:language` | Pass: "no banned phrases" |
| Unit and integration tests | `npm test` | Pass: 37 files, 564 tests (MongoDB 8.2.6 via mongodb-memory-server) |
| Build | `npm run build` | Pass |
| End-to-end tests | `npm run test:e2e` | Pass: 139 passed, 1 not run, 0 failed (the internal link check is desktop-only by design) |
| MCP smoke test | `npm run mcp:smoke` | Pass: 48/48 checks, 42 tool calls across 16 tools |
| Spell check | `npx cspell "**/*.md" --no-progress` | Pass: 0 issues (13 files checked) |
| Screenshots | `npm run screenshots` | 100 PNG files in `docs/screenshots` (25 views x 2 widths x 2 themes), inspected visually; 32 were added for the Items 8 to 14 views |
| Dependency audit | `npm audit --omit=dev` | "found 0 vulnerabilities" |
| Affiliation matcher self-check | `.scratch/aff-v3.ts` (not committed) over every manifest group, recipient team, alias and organization name, plus 101 common and probe organization names | No false positive found; regression set in `tests/unit/affiliation.test.ts` passes. Known limits listed in METHODOLOGY.md (single head words such as "Runtime" match the official name they start) |
| YAML | workflows and issue templates parsed with `yaml` | Pass |

## Secret scan

`git log -p main..HEAD` (57,463 lines, run on 27 Nov 2026 before the documentation commit) was searched for `mongodb+srv://`, GitHub tokens (`ghp_` followed by 20 or more characters), `BEGIN ... PRIVATE KEY` blocks and three credential markers kept outside the repository (the password and user-name prefixes of the Atlas account).

- GitHub tokens, private keys, credential markers: 0 matches.
- `mongodb+srv://`: 3 matches. One is the fake fixture `user:...@cluster0.example123.mongodb.net` in `tests/integration/store-fallback.test.ts`, which tests that hosts and passwords are redacted from error messages. It is not a real credential. The other two are the words "mongodb+srv://" in the earlier version of this file, which names the search pattern.

## MongoDB Atlas

Not connected. One retry on 27 Nov 2026 at 12:13:03 UTC (finished 12:13:14 UTC), `node --env-file=.env.local --import tsx scripts/db-ping.ts` with the connection string redacted from the output, exited with code 3. The egress IP reported by a public IP echo service at that time was 44.197.216.203 (earlier attempts on 26 Nov came from 100.54.232.217, so the sandbox egress IP changes and the Network Access list cannot rely on one address):

```
MongoDB ping failed after 10028 ms: MongoServerSelectionError: 80C1F372067F0000:error:0A000438:SSL routines:ssl3_read_bytes:tlsv1 alert internal error:../deps/openssl/openssl/ssl/record/rec_layer_s3.c:918:SSL alert number 80
```

The TLS alert 80 is consistent with the client IP not being on the project's Network Access list, but this was not tested: no attempt from an allowed address has been made, so another cause (for example a paused cluster) is not excluded. `db:setup` and `db:load` were not run against Atlas, and the site serves the published files read-only. To connect, add the server's IP (or an allowed range for the deployment) to Atlas Network Access and rerun the ping, then `db:setup` and `db:load`.

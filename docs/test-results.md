# Test results

Recorded on 26 Nov 2026 (UTC) on branch `feat/full-platform`, Node.js 22.23, in the development sandbox. CI reruns the same checks on every push ([.github/workflows/ci.yml](../.github/workflows/ci.yml)).

| Check | Command | Result |
| --- | --- | --- |
| Truth audit and publish | `npm run publish` | Pass: "Truth audit: 2929 checks, 0 failures"; 55 initiatives, 519 claims, 1038 evidence, 79 repos, 83 organizations, 600 relationships, 232 changes |
| Type check | `npm run typecheck` | Pass |
| Lint | `npm run lint` | Pass |
| Neutral-language lint | `npm run lint:language` | Pass: "no banned phrases" |
| Unit and integration tests | `npm test` | Pass: 29 files, 340 tests (MongoDB 8.2.6 via mongodb-memory-server) |
| Build | `npm run build` | Pass |
| End-to-end tests | `npm run test:e2e` | Pass: 111 passed, 1 skipped (the internal link check runs on the desktop project only, by design) |
| MCP smoke test | `npm run mcp:smoke` | Pass: 48/48 checks, 42 tool calls across 16 tools |
| Spell check | `npx cspell "**/*.md" --no-progress` | Pass: 0 issues |
| Screenshots | `npm run screenshots` | 68 PNG files (17 views x 2 widths x 2 themes), inspected visually |
| Dependency audit | `npm audit --omit=dev` | "found 0 vulnerabilities" |
| YAML | workflows and issue templates parsed with `yaml` | Pass |

## Secret scan

`git log -p main..HEAD` was searched for `mongodb+srv://`, GitHub tokens (`ghp_` followed by 20 or more characters), `BEGIN ... PRIVATE KEY` blocks and the three credential markers kept outside the repository.

- GitHub tokens, private keys, credential markers: 0 matches.
- `mongodb+srv://`: 1 match, the fake fixture `user:...@cluster0.example123.mongodb.net` in `tests/integration/store-fallback.test.ts`, which tests that hosts and passwords are redacted from error messages. It is not a real credential.

## MongoDB Atlas

Not connected. `node --env-file=.env.local --import tsx scripts/db-ping.ts` at 14:00 UTC, from sandbox egress IP 100.54.232.217, exited with code 3:

```
MongoDB ping failed after 10027 ms: MongoServerSelectionError: ...:error:0A000438:SSL routines:ssl3_read_bytes:tlsv1 alert internal error:../deps/openssl/openssl/ssl/record/rec_layer_s3.c:918:SSL alert number 80
```

Atlas sends TLS alert 80 when the client IP is not on the project's Network Access list. The production build, which loads `.env.local`, logged the same error and served the published files read-only. `db:setup` and `db:load` were not run against Atlas. To connect, add the server's IP to Atlas Network Access and rerun the ping, then `db:setup` and `db:load`.

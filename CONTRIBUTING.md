# Contributing

Thanks for helping. Read [AGENTS.md](AGENTS.md) first: its product rules (research only, neutral language, equal treatment, no ranking, accuracy, privacy) apply to every change.

## Reporting a factual error

- On the site: open the dossier and use "Suggest a correction" on the statement or initiative. Corrections are moderated and published in the public changelog at `/corrections`.
- On GitHub: open an issue with the [evidence correction template](.github/ISSUE_TEMPLATE/evidence-correction.yml). Include a public https link to the evidence.

Do not include private contact details in a public issue, and do not put vulnerability details in a correction. See [SECURITY.md](SECURITY.md).

## Development setup

```bash
npm ci
npm run build
npm start
```

No database is needed: without `MONGODB_URI` the app reads `data/published/`. For MongoDB, see the README.

## Before you open a pull request

Run all checks and make sure they pass:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
npm run mcp:smoke
npx cspell "**/*.md" --no-progress
```

If you change the pipeline or anything the UI asserts, also run `npm run publish` and confirm `Truth audit: ... 0 failures`. Extend `research/audit.ts` for every new published fact.

## Conventions

- TypeScript strict, ESM, `@/` path alias. Follow the existing structure: engine code in `lib/`, pipeline in `research/`, UI in `app/` and `components/`.
- All figures go through `lib/intelligence/service.ts`, so the UI, API, MCP server and exports agree.
- New UI text must pass the neutral-language lint (part of `npm test`).
- American English, no em dashes, no typos.
- Do not edit generated files by hand (`data/published/`, `data/official/`, `skills/`, `docs/screenshots/`). Regenerate them with their npm scripts.
- Never commit secrets. `.env.local` is ignored.
- Commit messages start with a type: `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `ci:`, `refactor:`.

## License

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).

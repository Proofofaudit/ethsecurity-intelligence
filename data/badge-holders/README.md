# Badge-holder list for Home name search

Home offers a name search that runs only in the visitor's browser. It reads one public CSV:

`data/badge-holders/badge-holders.csv`

The file is not shipped. Until it exists, Home shows "Name search is not loaded yet" and no holders are invented. Add the file only from a public source, and keep the source link in the commit message.

## Schema

Header row required. Column names are lowercase. Order does not matter.

| Column | Required | Meaning |
| --- | --- | --- |
| `name` | yes | Public name as the holder publishes it. |
| `organisation` | no | Organization the holder publicly lists. Used to find initiatives that name the same organization. |
| `x_handle` | no | X handle, with or without `@`. A full x.com or twitter.com URL is also accepted. |
| `website` | no | Public website. Its host is compared with the websites listed for initiatives. |
| `github` | no | GitHub user or organization name, or its URL. Used to find public repositories of initiatives owned by that account. |
| `aliases` | no | Other names the holder uses, separated by semicolons. Searched like `name`. |

## Rules

- Public fields only. Never add emails, phone numbers, Telegram handles, wallet addresses or anything the holder has not published.
- Any column that is not listed above (including `linkedin`, which is never searched or shown) is dropped when the file is read, so an `email` column cannot reach the page, the search index or the browser. Remove such a column from the file anyway before you commit it.
- Quote a field that contains a comma. Use `""` for a quote inside a quoted field.
- Rows without a `name` are skipped. The reader accepts up to 5000 rows.
- Tests use fictional holders only (Alex Example, @example_alex) from `tests/fixtures/badge-holders.csv`. Never copy real names into tests, docs or screenshots.

## Privacy

The list is read on the server and sent with the Home page, trimmed to the fields matching uses (name, aliases, organisation, X handle, website, GitHub). Matching happens in the browser. What a visitor types is never sent, logged, stored or placed in a URL; there is no form, analytics or beacon on this path. `tests/unit/name-search.test.ts` (the parser drops email and other non-public columns) and `tests/e2e/name-search.spec.ts` (no non-GET requests, no storage writes) check this.

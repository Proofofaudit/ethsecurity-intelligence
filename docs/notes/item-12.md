# Item 12: 10-minute briefing

Text for the docs merge. The briefing is built on the server from the published dataset (`briefingFor` in `lib/intelligence/service.ts`, pure logic in `lib/intelligence/briefing.ts`). It runs no model and writes no prose.

## What it contains

Every dossier shows the same ordered list. An item is left out when its source data is missing.

1. Summary: the official `summary` field.
2. Proposal sections, quoted verbatim, in this order: `why`, `in_scope`, `out_scope`, then milestones with criteria, then `commitments` and `team` (grants) or `existing`, `who` and `hard_req` (RFPs).
3. Links from the official `links[]` list and from proposal text, each with a title, a type and where it appears.
4. Round 1 history, only when the record has matches.
5. Evidence card, only for sections that have items.

Section keys found in the published dataset (55 initiatives):

| Type | Count | Keys |
| --- | --- | --- |
| Grant | 47 | `why`, `team`, `why_grant`, `in_scope`, `out_scope`, `commitments` |
| RFP | 8 | `why`, `in_scope`, `out_scope`, `existing`, `who`, `hard_req` |

`why_grant` is an official grant section that is not in the requested order. It is not in the briefing; the dossier names it under "Other official sections not in this order" with a link. Keys the data does not contain (for example `requirements`, `deliverables`, `evaluation`) are not used.

## Reading time

Reading time is the number of words divided by 200 words per minute, rounded up to whole minutes, with a minimum of 1 minute per item. The total is the sum of the item times. Words are whitespace-separated tokens that contain a letter or digit, after link syntax and Markdown markers are removed; a bare URL counts as one word.

An item is marked Optional when the items before it already add up to 10 minutes or more. The item that crosses minute 10 is not Optional.

Across the 55 initiatives the total is 9 minutes at minimum, 21 at maximum and 12 at median. The part before the Optional items is 9 to 11 minutes (median 10).

## Link types

A type comes from the URL alone. Precedence is audit, repo, demo, docs, website, then "Link".

- Audit: a path segment that is exactly `audit`, `audits`, `audit-reports`, `audit-report`, `security-audit` or `security-audits` (on a code host only after the owner and repository), a `.pdf` file name containing "audit", or a host whose first label is one of those words.
- Repo: github.com, gitlab.com, bitbucket.org or codeberg.org with an owner and a repository in the path.
- Demo: first host label or first path segment is `demo`, `demos` or `playground`.
- Docs: first host label is `docs`, `doc`, `documentation` or `wiki`; the host is on readthedocs or gitbook; or the first path segment is `docs`, `doc` or `documentation`.
- Website: an address with no path whose host is not a social, chat, video, document or explorer service.
- Link: everything else. Link text is never used.

Email, phone and messenger links are left out, as on the Evidence card.

## Read marks and focus chain

"Mark as read" is stored in this browser in `esi.workspace` under `briefingRead` (item id `<initiative id>:<key>` to `{ readAt }`). It is part of the workspace export and import. No new storage key is added.

"Briefing for all in my focus" (`/workspace/briefing`) reads the same focus chips and keywords as May interest you, joins the matching initiatives once each, sorts them alphabetically by official title and shows the total time. The server sends every briefing; the browser decides which to show, so the focus is not sent to the server.

## Offline

The briefing needs no request after the page loads. The site has no service worker, so a page works offline only when the browser has it in its own cache. Read marks work offline.

## API

`GET /api/v1/initiatives/:id/briefing` returns the same briefing with its source URLs.

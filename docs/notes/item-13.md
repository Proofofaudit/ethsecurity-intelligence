# Item 13: Review progress and export (notes for the docs merge)

Review progress is a private checklist for the reader. It records which initiatives you have read, shows what changed in the published record since you last looked, and exports your notes. It is not a score and not a ranking. Every initiative is treated the same way.

Modules: `lib/workspace/progress.ts` (states, change detection), `lib/workspace/feed.ts` (server side builders `visitFeed`, `exportContext`), `lib/workspace/export.ts` (`workspaceToMarkdown`, `workspaceToCsv`, `workspaceToJson`). UI: `components/workspace/review-progress.tsx`. Store: `setProgressState`, `applyVisitFeed`, `clearAllMyData` in `components/workspace/store.ts`. Tests: `tests/unit/review-progress.test.ts`.

## States

| State | Meaning | How it is set |
|-------|---------|---------------|
| Not started | No mark. Default for every initiative. | Default, or by choosing it again (removes the mark). |
| Reading | You have begun reading. | By you. |
| Reviewed | You finished your review. | By you. The record as published at that moment is stored with the mark (`ProgressMark.seen`). |
| Revisit | The published record changed after you reviewed it. | Set by the site, never by hand. The state dropdown does not offer it (it only shows it when the site has set it). The mark names the change, for example "New revision 3; 2 new comments". |

A counter shows "You've reviewed N of M." The existing per-initiative "Mark reviewed" toggle and the new states share one record, so older workspaces that only have `reviewedAt` still read as Reviewed. Reviewed marks set from an initiative page store the record at that moment. Marks without a stored record (older workspaces, or a re-review without one) get their baseline from the published record on the next Overview or My Workspace visit, without reporting a change.

## Since your last visit

The list reuses the published change feed. Nothing is fetched per user and nothing is sent to TheDAO or to this site's server.

- The server builds one feed entry per initiative from the published dataset: the latest fetched revision number, the official comment count (`commentCount`) and the change records already in `d.changes`.
- The browser stores the record it saw (`visit.seen`). When a new visit starts (the previous page view is more than 30 minutes old), that snapshot becomes `visit.baseline`. The list compares the current feed with the baseline.
- A change is reported only when the record differs: a change record whose id was not in the stored snapshot, a higher revision number, or a higher comment count. Comments are detected through an increase of `commentCount` only. Comment text is not stored or shown.
- The first visit has no baseline and lists nothing. An empty list says that nothing changed. Empty comments are normal.
- Reviewed to Revisit uses `ProgressMark.seen`: if any of the three differences above appears after the Reviewed mark was set, the state becomes Revisit and the reason is saved. A Revisit mark keeps its original date and updates its reason if more changes arrive. Marking the initiative Reviewed again stores a fresh `seen` (or none, then the next visit fills it) and clears the reason.
- The list is alphabetical (neutral), not ordered by size or importance of the change.

## Export

Three formats, written in the browser from your workspace and a context built on the server from the published dataset. Files are named `ethsecurity-review-progress-<timestamp>.md`, `.csv` and `.json`.

| Format | Content |
|--------|---------|
| Markdown | Counter, dataset version and publication timestamp, source URLs, then per initiative: state, reason, saved mark, source link, notes, your questions, open questions with asked or resolved marks, evidence links. General notes and questions at the end. |
| CSV | One row per record (`source_url`, `progress`, `saved_for_later`, `note`, `question`, `open_question`, `evidence_link`). Every row carries `dataset_version` and `data_as_of`. Cells starting with `=`, `+`, `-`, `@`, tab or carriage return get a leading apostrophe so spreadsheets do not run them as formulas. |
| JSON | The whole workspace, plus dataset version and timestamp, source URLs, open questions with marks and evidence links. The workspace part is a normal export, so Import restores it exactly (validated by `parseImport`). |

Only initiatives with a state, a save, a note, a question or a marked open question appear. Sources are the official TheDAO URLs plus the dataset's official source link. Open questions come from Item 11 and evidence links from the evidence card (Item 8).

## Storage and clearing

- No new storage key. Progress marks live in the existing `esi.workspace` key under `progress`, and the last seen record under `visit`. Both are optional fields with defaults, so older exports and workspaces still import.
- "Clear all my data" removes every localStorage key that starts with `esi.` (workspace, AI Lab templates, theme) after a confirmation, resets the in-memory state, returns the page to the system theme and tells the AI Lab templates list to re-read storage. Export first if you want to keep it. The existing "Clear workspace" button still resets only `esi.workspace`.
- Import replaces the workspace after a confirmation.
- My Workspace has two JSON exports: "Export workspace JSON" (the workspace only) and, under Review progress, "Export JSON with sources" (the workspace plus dataset version, timestamp, source URLs, open questions and evidence links).
- Page payload: the export context for 55 initiatives measures about 200 KB as JSON (the visit feed about 38 KB), sent only with `/workspace`. It is kept so exports need no extra request; building it on demand would need a new endpoint.

## Privacy

Progress, notes, questions and the visit snapshot stay in this browser. The only requests are same-origin page loads that carry no workspace data. Exports are files saved on your device. Nothing is uploaded, shared or tracked, and there are no accounts. Clearing browser storage or using "Clear all my data" removes it, and the site cannot recover it.

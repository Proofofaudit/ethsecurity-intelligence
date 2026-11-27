# Item 10: Similar initiatives (similar@1)

Status: implemented in commit 4d9b10f. The full method text is already in METHODOLOGY.md ("Similar initiatives").

- Code: `lib/intelligence/similar.ts` (`similarPairs`, `isVisible`, `SIMILAR_THRESHOLDS`), service wrappers `similarPairsOf`, `similarFor`, `similarLabelsById` in `lib/intelligence/service.ts`, panel `SimilarInitiatives` in `components/dossier/similar.tsx`, API `GET /api/v1/initiatives/[id]/similar`, Research filter `similar=any|overlap|complement`.
- Signals: shared official categories, shared manifest affiliation group (disabled and stated when the manifest is not aligned), shared two-word keyword phrases in `why` and `in_scope`, shared named standards or technologies, shared non-anonymous backers.
- Thresholds: a phrase used by more than 5 initiatives does not count; 2 shared phrases make a strong keyword signal.
- Weak-signal rule: a pair needs at least two independent signals, or one strong signal, to be shown (see `isVisible`).
- Same organization: labelled "Same organization", not treated as overlap.
- Order: alphabetical by title. No scores, percentages or rankings. Notice text: "This is a research hypothesis, not a finding".
- AI hypotheses: not shipped (pending; they would use the shared AI interpretation label).
- Result on the published dataset (55 initiatives, 1,485 pairs): 174 shown (141 Possible overlap, 30 Possible complement, 3 Same organization); 1,311 hidden.
